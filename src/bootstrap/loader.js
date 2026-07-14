'use strict';

/**
 * IMAGE-only bootstrap loader. Runs as the container CMD. Decides whether to
 * boot the baked-in image bundle (dist/plugin/index.js) or an OTA payload
 * (<dataDir>/ota/active/main.js), with crash-loop protection and rollback.
 *
 * HARD RULE: this file imports ONLY node builtins and inlines the tiny bits of
 * semver/state logic it needs. It must never require app code or node_modules —
 * otherwise a broken OTA payload could take the loader down with it.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const PREFIX = 'HOMECONNECT';
const MAX_BOOT_ATTEMPTS = 3;

const dataDir = process.env[`${PREFIX}_DATA_DIR`] || process.env.PLUGIN_STATE_DIR || '/data';
const coreVersion = process.env[`${PREFIX}_VERSION`] || '0.0.0';

const imageMainPath = path.join(__dirname, '..', 'plugin', 'index.js');
const otaDir = path.join(dataDir, 'ota');
const activeDir = path.join(otaDir, 'active');
const otaMainPath = path.join(activeDir, 'main.js');
const otaManifestPath = path.join(activeDir, 'manifest.json');
const stateFile = path.join(otaDir, 'state.json');

function log(msg) {
	// eslint-disable-next-line no-console
	console.log(`[${new Date().toISOString()}] [LOADER] ${msg}`);
}

/* ---- inlined semver ---- */
function parseSemver(v) {
	const core = String(v || '').trim().replace(/^v/iu, '').split(/[-+]/u)[0] || '';
	const p = core.split('.');
	const num = s => { const n = Number.parseInt(s == null ? '0' : s, 10); return Number.isFinite(n) && n >= 0 ? n : 0; };
	return [num(p[0]), num(p[1]), num(p[2])];
}
function compareSemver(a, b) {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	for (let i = 0; i < 3; i += 1) { if (pa[i] > pb[i]) return 1; if (pa[i] < pb[i]) return -1; }
	return 0;
}
function buildTail(v) { const s = String(v || ''); const i = s.indexOf('+'); return i >= 0 ? s.slice(i + 1) : ''; }
function isNewerWithBuild(a, b) {
	const c = compareSemver(a, b);
	if (c !== 0) return c > 0;
	const ta = buildTail(a);
	const tb = buildTail(b);
	if (ta === tb) return false;
	return ta > tb;
}
const isAtLeast = (a, b) => compareSemver(a, b) >= 0;

/* ---- inlined state ---- */
function readState() {
	try {
		const s = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
		return {
			activeVersion: typeof s.activeVersion === 'string' ? s.activeVersion : null,
			bootAttempts: Number.isInteger(s.bootAttempts) && s.bootAttempts >= 0 ? s.bootAttempts : 0,
			lastGoodAt: typeof s.lastGoodAt === 'string' ? s.lastGoodAt : null,
			quarantined: Array.isArray(s.quarantined) ? s.quarantined.filter(v => typeof v === 'string') : [],
		};
	} catch {
		return { activeVersion: null, bootAttempts: 0, lastGoodAt: null, quarantined: [] };
	}
}
function writeState(state) {
	try {
		fs.mkdirSync(otaDir, { recursive: true });
		const tmp = `${stateFile}.tmp-${process.pid}`;
		fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
		fs.renameSync(tmp, stateFile);
	} catch { /* best-effort */ }
}
function quarantine(version) {
	const s = readState();
	const set = new Set(s.quarantined);
	if (version) set.add(version);
	try { fs.rmSync(activeDir, { recursive: true, force: true }); } catch { /* ignore */ }
	writeState({ ...s, quarantined: Array.from(set), bootAttempts: 0, activeVersion: null });
}

function readManifest() {
	try {
		const m = JSON.parse(fs.readFileSync(otaManifestPath, 'utf8'));
		if (m && typeof m === 'object' && typeof m.version === 'string'
			&& typeof m.minCoreVersion === 'string') return m;
		return null;
	} catch {
		return null;
	}
}

function fileSha256(p) {
	try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch { return null; }
}

/**
 * Decide which bundle to run. Returns { target:'image'|'ota', reason, version? }.
 * Order matters (matches the OTA design spec).
 */
function decideBundle() {
	if (!fs.existsSync(otaMainPath)) return { target: 'image', reason: 'no-bundle' };

	const manifest = readManifest();
	if (!manifest) { quarantine(null); return { target: 'image', reason: 'manifest-invalid' }; }

	// Verify the unpacked main.js against the manifest's mainSha256 (NOT the
	// bundle-file hash). Absent field = old payload → skip the check.
	if (typeof manifest.mainSha256 === 'string' && manifest.mainSha256.length === 64) {
		const actual = fileSha256(otaMainPath);
		if (actual && actual.toLowerCase() !== manifest.mainSha256.toLowerCase()) {
			quarantine(manifest.version);
			return { target: 'image', reason: 'sha-mismatch' };
		}
	}

	// Image core too old for this payload → run image, but do NOT quarantine
	// (a future core update may satisfy it).
	if (!isAtLeast(coreVersion, manifest.minCoreVersion)) {
		return { target: 'image', reason: 'requires-core' };
	}

	// A freshly installed image that is >= the OTA payload supersedes it.
	if (!isNewerWithBuild(manifest.version, coreVersion)) {
		return { target: 'image', reason: 'core-supersedes' };
	}

	const state = readState();
	if (state.bootAttempts >= MAX_BOOT_ATTEMPTS) {
		quarantine(manifest.version);
		return { target: 'image', reason: 'crash-loop' };
	}

	return { target: 'ota', reason: 'ok', version: manifest.version };
}

function installHealthyHook(target, version) {
	globalThis.__otaMarkHealthy = () => {
		const s = readState();
		writeState({
			...s,
			bootAttempts: 0,
			lastGoodAt: new Date().toISOString(),
			activeVersion: target === 'ota' ? (version || s.activeVersion) : s.activeVersion,
		});
	};
}

async function runLoader() {
	const decision = decideBundle();
	log(`decision: ${decision.target} (${decision.reason}${decision.version ? ` ${decision.version}` : ''})`);

	if (decision.target === 'ota') {
		const s = readState();
		writeState({ ...s, bootAttempts: s.bootAttempts + 1, activeVersion: decision.version });
		process.env[`${PREFIX}_OTA_ACTIVE`] = '1';
		process.env[`${PREFIX}_OTA_VERSION`] = decision.version;
		installHealthyHook('ota', decision.version);
		try {
			log(`running OTA bundle ${decision.version}`);
			// eslint-disable-next-line global-require, import/no-dynamic-require
			const mod = require(otaMainPath);
			await mod.main();
			return;
		} catch (e) {
			log(`OTA bundle failed to start: ${e && e.stack ? e.stack : e}. Quarantining + falling back to image.`);
			quarantine(decision.version);
			// fall through to image
		}
	}

	process.env[`${PREFIX}_OTA_ACTIVE`] = '0';
	process.env[`${PREFIX}_OTA_VERSION`] = coreVersion;
	installHealthyHook('image', coreVersion);
	log('running image bundle');
	// eslint-disable-next-line global-require, import/no-dynamic-require
	const mod = require(imageMainPath);
	await mod.main();
}

// Global robustness: never let an unhandled async error kill the process.
process.on('unhandledRejection', (reason) => {
	log(`unhandledRejection: ${reason && reason.stack ? reason.stack : reason}`);
});
process.on('uncaughtException', (err) => {
	log(`uncaughtException: ${err && err.stack ? err.stack : err}`);
});

if (require.main === module) {
	runLoader().catch((e) => {
		log(`fatal loader error: ${e && e.stack ? e.stack : e}`);
		process.exit(1);
	});
}

module.exports = { decideBundle, runLoader };
