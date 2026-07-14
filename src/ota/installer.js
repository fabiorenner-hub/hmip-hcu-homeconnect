'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha256Hex, sha256Matches, verifySignature } = require('./verify');

const BUNDLE_FORMAT = 'homeconnect-ota-1';

/** Only `main.js` and files under `public/` are allowed. No traversal. */
function isSafeBundlePath(rel) {
	if (typeof rel !== 'string' || rel.length === 0) return false;
	if (rel.includes('\\') || rel.includes('\0')) return false;
	if (rel.startsWith('/') || rel.includes('..')) return false;
	const norm = path.posix.normalize(rel);
	if (norm !== rel) return false;
	return norm === 'main.js' || norm.startsWith('public/');
}

function parseBundleFile(json) {
	let obj;
	try {
		obj = JSON.parse(json);
	} catch {
		return null;
	}
	if (obj === null || typeof obj !== 'object') return null;
	if (obj.format !== BUNDLE_FORMAT) return null;
	if (typeof obj.version !== 'string') return null;
	if (obj.files === null || typeof obj.files !== 'object') return null;
	const files = {};
	let hasMain = false;
	for (const [rel, b64] of Object.entries(obj.files)) {
		if (!isSafeBundlePath(rel)) return null;
		if (typeof b64 !== 'string') return null;
		files[rel] = Buffer.from(b64, 'base64');
		if (rel === 'main.js') hasMain = true;
	}
	if (!hasMain) return null;
	return { format: obj.format, version: obj.version, files };
}

function rmrf(dir) {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}

/**
 * Download + verify + stage + atomically activate an OTA bundle.
 *
 * deps: { dataDir, fetchImpl, publicKeyPem?, logger? }
 * Returns { ok:true, version } or { ok:false, error }.
 */
async function installBundle(manifest, deps) {
	const { dataDir, fetchImpl, publicKeyPem, logger } = deps;
	const otaDir = path.join(dataDir, 'ota');
	const stagingDir = path.join(otaDir, 'staging');
	const activeDir = path.join(otaDir, 'active');
	const log = (lvl, msg) => { if (logger) logger(lvl, `[ota-install] ${msg}`); };

	let bytes;
	try {
		const res = await fetchImpl(manifest.assetUrl, {
			headers: { 'User-Agent': 'hcu-ota', Accept: 'application/octet-stream' },
		});
		if (!res.ok) return { ok: false, error: `download-failed:${res.status}` };
		const ab = await res.arrayBuffer();
		bytes = Buffer.from(ab);
	} catch (e) {
		return { ok: false, error: `download-error:${e && e.message ? e.message : 'unknown'}` };
	}

	if (!sha256Matches(bytes, manifest.sha256)) {
		log('warn', 'sha256 mismatch on downloaded bundle');
		return { ok: false, error: 'verify-failed' };
	}
	if (!verifySignature(bytes, manifest.signature, publicKeyPem)) {
		log('warn', 'signature verification failed');
		return { ok: false, error: 'signature-failed' };
	}

	const bundle = parseBundleFile(bytes.toString('utf8'));
	if (!bundle) return { ok: false, error: 'bundle-invalid' };

	// Write staging.
	rmrf(stagingDir);
	try {
		fs.mkdirSync(stagingDir, { recursive: true });
		for (const [rel, buf] of Object.entries(bundle.files)) {
			const dest = path.join(stagingDir, rel);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.writeFileSync(dest, buf);
		}
		const mainSha256 = sha256Hex(bundle.files['main.js']);
		const stagedManifest = { ...manifest, mainSha256 };
		fs.writeFileSync(
			path.join(stagingDir, 'manifest.json'),
			JSON.stringify(stagedManifest, null, 2),
			'utf8',
		);
	} catch (e) {
		rmrf(stagingDir);
		return { ok: false, error: `staging-error:${e && e.message ? e.message : 'unknown'}` };
	}

	// Atomic-ish activate: remove old active, rename staging → active.
	try {
		rmrf(activeDir);
		fs.renameSync(stagingDir, activeDir);
	} catch (e) {
		rmrf(stagingDir);
		return { ok: false, error: `activate-error:${e && e.message ? e.message : 'unknown'}` };
	}

	log('info', `installed OTA bundle ${manifest.version}`);
	return { ok: true, version: manifest.version };
}

module.exports = { BUNDLE_FORMAT, isSafeBundlePath, parseBundleFile, installBundle };
