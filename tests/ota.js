'use strict';

/**
 * OTA + analytics unit tests. No network, no HCU.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

function tmpdir(tag) {
	const d = path.join(os.tmpdir(), `hc-ota-test-${tag}-${crypto.randomUUID().slice(0, 8)}`);
	fs.mkdirSync(d, { recursive: true });
	return d;
}
function sha256(buf) {
	return crypto.createHash('sha256').update(buf).digest('hex');
}

(async () => {
	/* ---- semver ---- */
	const semver = require('../src/ota/semver');
	assert.strictEqual(semver.isNewer('1.2.3', '1.2.2'), true);
	assert.strictEqual(semver.isNewer('1.2.3', '1.2.3'), false);
	assert.strictEqual(semver.isAtLeast('1.2.3', '1.2.3'), true);
	assert.strictEqual(semver.isAtLeast('1.2.2', '1.2.3'), false);
	// same core + build-tail ordering; a tail beats no tail
	assert.strictEqual(semver.isNewerWithBuild('0.7.0+exp.20260714T120000Z', '0.7.0'), true);
	assert.strictEqual(semver.isNewerWithBuild('0.7.0', '0.7.0'), false);
	assert.strictEqual(
		semver.isNewerWithBuild('0.7.0+exp.20260714T130000Z', '0.7.0+exp.20260714T120000Z'),
		true,
	);
	assert.strictEqual(
		semver.isNewerWithBuild('0.7.0+exp.20260714T120000Z', '0.7.0+exp.20260714T130000Z'),
		false,
	);

	/* ---- github ---- */
	const github = require('../src/ota/github');
	const rel = github.parseRelease({
		tag_name: 'v1.0.0',
		html_url: 'https://x/y',
		prerelease: false,
		assets: [
			{ name: 'ota-manifest.json', browser_download_url: 'https://a/ota-manifest.json' },
			{ name: 'homeconnect-ota-1.0.0.json', browser_download_url: 'https://a/homeconnect-ota-1.0.0.json' },
			{ name: 'x.sha256', browser_download_url: 'https://a/x.sha256' },
			{ name: 'evil', browser_download_url: 'http://insecure/evil' }, // dropped (not https)
		],
	});
	assert.strictEqual(rel.tagName, 'v1.0.0');
	assert.strictEqual(rel.assets.length, 3, 'non-https asset dropped');
	const found = github.findOtaAssets(rel);
	assert.ok(found.manifest && found.bundle && found.sha256);
	assert.strictEqual(found.manifest.name, 'ota-manifest.json');

	// fetchLatestPrerelease returns the first prerelease
	const listFetch = async () => ({
		ok: true, status: 200,
		json: async () => ([
			{ tag_name: 'v1.0.0', html_url: 'h', prerelease: false, assets: [] },
			{ tag_name: 'experimental', html_url: 'h', prerelease: true, assets: [] },
		]),
		text: async () => '', arrayBuffer: async () => new ArrayBuffer(0),
	});
	const pre = await github.fetchLatestPrerelease(listFetch);
	assert.ok(pre && pre.prerelease === true && pre.tagName === 'experimental');

	/* ---- manifest ---- */
	const { validateManifest } = require('../src/ota/manifest');
	assert.ok(validateManifest({
		version: '1.0.0', minCoreVersion: '0.7.0', sha256: 'a'.repeat(64),
		assetUrl: 'https://x/b.json', bundleName: 'b.json',
	}));
	assert.strictEqual(validateManifest({
		version: '1.0.0', minCoreVersion: '0.7.0', sha256: 'zz',
		assetUrl: 'https://x/b.json', bundleName: 'b.json',
	}), null, 'bad sha rejected');
	assert.strictEqual(validateManifest({
		version: '1.0.0', minCoreVersion: '0.7.0', sha256: 'a'.repeat(64),
		assetUrl: 'http://x/b.json', bundleName: 'b.json',
	}), null, 'non-https assetUrl rejected');

	/* ---- installer ---- */
	const installer = require('../src/ota/installer');
	assert.strictEqual(installer.isSafeBundlePath('main.js'), true);
	assert.strictEqual(installer.isSafeBundlePath('public/app.js'), true);
	assert.strictEqual(installer.isSafeBundlePath('../etc/passwd'), false);
	assert.strictEqual(installer.isSafeBundlePath('/abs'), false);
	assert.strictEqual(installer.isSafeBundlePath('sneaky/../../x'), false);

	const dataDir = tmpdir('install');
	const mainCode = 'module.exports.main=async()=>{};';
	const bundleObj = { format: 'homeconnect-ota-1', version: '9.9.9', files: { 'main.js': Buffer.from(mainCode).toString('base64') } };
	const bundleBytes = Buffer.from(JSON.stringify(bundleObj), 'utf8');
	const goodManifest = {
		version: '9.9.9', minCoreVersion: '0.7.0', sha256: sha256(bundleBytes),
		assetUrl: 'https://x/b.json', bundleName: 'b.json',
	};
	const makeFetch = (bytes) => async () => ({
		ok: true, status: 200,
		arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
		text: async () => bytes.toString('utf8'), json: async () => JSON.parse(bytes.toString('utf8')),
	});

	const okRes = await installer.installBundle(goodManifest, { dataDir, fetchImpl: makeFetch(bundleBytes) });
	assert.strictEqual(okRes.ok, true, 'happy-path install');
	const activeMain = path.join(dataDir, 'ota', 'active', 'main.js');
	assert.ok(fs.existsSync(activeMain), 'active/main.js exists after install');
	const stagedManifest = JSON.parse(fs.readFileSync(path.join(dataDir, 'ota', 'active', 'manifest.json'), 'utf8'));
	assert.strictEqual(stagedManifest.mainSha256, sha256(Buffer.from(mainCode)), 'mainSha256 written');

	// sha mismatch → verify-failed, active untouched
	const badManifest = { ...goodManifest, sha256: 'b'.repeat(64) };
	const badRes = await installer.installBundle(badManifest, { dataDir, fetchImpl: makeFetch(bundleBytes) });
	assert.strictEqual(badRes.ok, false);
	assert.strictEqual(badRes.error, 'verify-failed');
	assert.ok(fs.existsSync(activeMain), 'active preserved after failed install');

	/* ---- loader.decideBundle ---- */
	const loaderDir = tmpdir('loader');
	process.env.PLUGIN_STATE_DIR = loaderDir;
	process.env.HOMECONNECT_VERSION = '0.7.0';
	const loader = require('../src/bootstrap/loader');
	const activeDir = path.join(loaderDir, 'ota', 'active');

	const setupActive = (mainContent, manifestObj) => {
		fs.rmSync(path.join(loaderDir, 'ota'), { recursive: true, force: true });
		fs.mkdirSync(activeDir, { recursive: true });
		fs.writeFileSync(path.join(activeDir, 'main.js'), mainContent);
		if (manifestObj) fs.writeFileSync(path.join(activeDir, 'manifest.json'), JSON.stringify(manifestObj));
	};
	const withSha = (mainContent, m) => ({ ...m, mainSha256: sha256(Buffer.from(mainContent)) });

	// no bundle
	fs.rmSync(path.join(loaderDir, 'ota'), { recursive: true, force: true });
	assert.strictEqual(loader.decideBundle().reason, 'no-bundle');

	// ok (newer than core, sha matches)
	const m1 = 'x';
	setupActive(m1, withSha(m1, { version: '0.8.0', minCoreVersion: '0.7.0' }));
	assert.strictEqual(loader.decideBundle().reason, 'ok');

	// manifest invalid → quarantine
	setupActive('x', null);
	fs.writeFileSync(path.join(activeDir, 'manifest.json'), '{not json');
	assert.strictEqual(loader.decideBundle().reason, 'manifest-invalid');

	// sha mismatch
	setupActive('realcontent', { version: '0.8.0', minCoreVersion: '0.7.0', mainSha256: 'a'.repeat(64) });
	assert.strictEqual(loader.decideBundle().reason, 'sha-mismatch');

	// requires-core (no quarantine)
	setupActive(m1, withSha(m1, { version: '0.8.0', minCoreVersion: '9.9.9' }));
	assert.strictEqual(loader.decideBundle().reason, 'requires-core');
	assert.ok(fs.existsSync(path.join(activeDir, 'main.js')), 'requires-core must NOT quarantine');

	// core-supersedes (payload == core)
	setupActive(m1, withSha(m1, { version: '0.7.0', minCoreVersion: '0.7.0' }));
	assert.strictEqual(loader.decideBundle().reason, 'core-supersedes');

	// crash-loop
	setupActive(m1, withSha(m1, { version: '0.8.0', minCoreVersion: '0.7.0' }));
	fs.writeFileSync(path.join(loaderDir, 'ota', 'state.json'), JSON.stringify({ bootAttempts: 3, quarantined: [] }));
	assert.strictEqual(loader.decideBundle().reason, 'crash-loop');

	/* ---- manager ---- */
	const { OtaManager } = require('../src/ota/manager');
	const mgrDir = tmpdir('mgr');
	let channel = 'stable';
	const manifestForRelease = (v) => ({
		version: v, minCoreVersion: '0.7.0', sha256: 'a'.repeat(64),
		assetUrl: 'https://x/b.json', bundleName: 'b.json',
	});
	const mgrFetch = async (url) => {
		// releases list / latest
		if (url.includes('/releases/latest')) {
			return {
				ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '',
				json: async () => ({ tag_name: 'v0.9.0', html_url: 'h', prerelease: false, assets: [
					{ name: 'ota-manifest.json', browser_download_url: 'https://a/ota-manifest.json' },
				] }),
			};
		}
		if (url.includes('/releases?')) {
			return {
				ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '',
				json: async () => ([{ tag_name: 'experimental', html_url: 'h', prerelease: true, assets: [
					{ name: 'ota-manifest-exp.json', browser_download_url: 'https://a/ota-manifest-exp.json' },
				] }]),
			};
		}
		// manifest asset
		const v = url.includes('exp') ? '0.7.0+exp.20260714T120000Z' : '0.9.0';
		const body = JSON.stringify(manifestForRelease(v));
		return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), text: async () => body, json: async () => JSON.parse(body) };
	};
	const mgr = new OtaManager({
		dataDir: mgrDir, coreVersion: '0.7.0',
		getConfig: () => ({ mode: 'manual', channel, checkIntervalHours: 6 }),
		fetchImpl: mgrFetch,
	});
	let st = await mgr.check();
	assert.strictEqual(st.channel, 'stable');
	assert.strictEqual(st.latestVersion, '0.9.0');
	assert.strictEqual(st.updateAvailable, true, 'stable: 0.9.0 > 0.7.0');
	assert.strictEqual(st.requiresCore, false);

	channel = 'experimental';
	st = await mgr.check();
	assert.strictEqual(st.channel, 'experimental');
	assert.strictEqual(st.updateAvailable, true, 'experimental: build tail is newer');

	// already-current: core equals latest stable
	channel = 'stable';
	const mgr2 = new OtaManager({
		dataDir: tmpdir('mgr2'), coreVersion: '0.9.0',
		getConfig: () => ({ mode: 'manual', channel: 'stable', checkIntervalHours: 6 }),
		fetchImpl: mgrFetch,
	});
	const st2 = await mgr2.check();
	assert.strictEqual(st2.updateAvailable, false, '0.9.0 not newer than core 0.9.0');
	const inst = await mgr2.install();
	assert.strictEqual(inst.ok, false);
	assert.strictEqual(inst.error, 'already-current');

	/* ---- callHome ---- */
	const { CallHome, loadInstallId, isHex64 } = require('../src/analytics/callHome');
	const anDir = tmpdir('analytics');
	const spy = { calls: 0, lastBody: null, lastHeaders: null };
	const spyFetch = async (url, init) => { spy.calls += 1; spy.lastBody = init && init.body; spy.lastHeaders = init && init.headers; return { ok: true, status: 204 }; };
	const buildFields = () => ({
		coreVersion: '0.7.1', otaVersion: '0.7.1', buildId: '0.7.1', arch: 'arm64', hcuFirmware: '1.4.7', lang: 'de',
	});

	const disabled = new CallHome({
		dataDir: anDir, fetchImpl: spyFetch, buildFields,
		getConfig: () => ({ enabled: false, endpoint: 'https://c/x', intervalHours: 24 }),
	});
	await disabled.sendEvent('start');
	assert.strictEqual(spy.calls, 0, 'disabled → no send (opt-out works)');

	const noEndpoint = new CallHome({
		dataDir: anDir, fetchImpl: spyFetch, buildFields,
		getConfig: () => ({ enabled: true, endpoint: '', intervalHours: 24 }),
	});
	await noEndpoint.sendEvent('start');
	assert.strictEqual(spy.calls, 0, 'no endpoint → no send');

	const httpOnly = new CallHome({
		dataDir: anDir, fetchImpl: spyFetch, buildFields,
		getConfig: () => ({ enabled: true, endpoint: 'http://insecure/x', intervalHours: 24 }),
	});
	await httpOnly.sendEvent('start');
	assert.strictEqual(spy.calls, 0, 'non-https → no send');

	const enabled = new CallHome({
		dataDir: anDir, fetchImpl: spyFetch, buildFields,
		getConfig: () => ({ enabled: true, endpoint: 'https://c/x', intervalHours: 24, pingSecret: 's3cr3t' }),
	});
	const sent = await enabled.sendEvent('start');
	assert.strictEqual(sent, true, 'enabled + https → send');
	assert.strictEqual(spy.calls, 1);
	assert.strictEqual(spy.lastHeaders['X-HPA-Ping-Secret'], 's3cr3t', 'ping secret header sent when configured');

	// HTTP 400 → long cooldown, no fast retry (payload likely invalid)
	let status400 = 400;
	const rejectFetch = async () => ({ ok: false, status: status400 });
	const rejecter = new CallHome({
		dataDir: tmpdir('an-reject'), fetchImpl: rejectFetch, buildFields,
		getConfig: () => ({ enabled: true, endpoint: 'https://c/x', intervalHours: 24 }),
	});
	assert.strictEqual(await rejecter.sendEvent('start'), false, '400 → not sent');
	assert.ok(rejecter._nextAllowedAt - Date.now() > 12 * 3600 * 1000, '400 sets a long (>12h) cooldown');
	assert.strictEqual(await rejecter.sendEvent('start'), false, '400 → blocked by cooldown, no fast retry');
	// force bypasses the cooldown (used by the manual "send now" dashboard button)
	status400 = 204;
	assert.strictEqual(await rejecter.sendEvent('start', { force: true }), true, 'force bypasses backoff');
	const anStatus = await rejecter.status();
	assert.strictEqual(anStatus.lastStatus, 204, 'status() reports the last HTTP status');
	assert.strictEqual(anStatus.enabled, true, 'status() reports enabled');

	// payload shape (schema-1) + NO forbidden fields
	const payload = await enabled.preview('start');
	assert.strictEqual(payload.schema, 1);
	assert.strictEqual(payload.event, 'start');
	assert.ok(isHex64(payload.installId), 'installId is 64 lowercase hex');
	assert.ok(payload.pluginId && payload.coreVersion && payload.otaVersion);
	const json = JSON.stringify(payload).toLowerCase();
	for (const forbidden of ['token', 'refresh', 'address', 'sgtin', 'serial', 'room', 'clientid', 'haid', 'lat', 'lon']) {
		assert.ok(!json.includes(forbidden), `payload must not contain "${forbidden}"`);
	}
	assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') <= 4096, 'payload within 4096 bytes');

	// installId stable across "restarts" and matches sha256(salt+seed) format
	const again = new CallHome({
		dataDir: anDir, fetchImpl: spyFetch, buildFields,
		getConfig: () => ({ enabled: false, intervalHours: 24 }),
	});
	const p2 = await again.preview('heartbeat');
	assert.strictEqual(p2.installId, payload.installId, 'installId stable across restarts');
	assert.strictEqual(p2.event, 'heartbeat');

	// installId derived from an SGTIN never leaks the SGTIN and is deterministic
	const idA = await loadInstallId(tmpdir('sg'), 'HCU-SGTIN-123');
	const idB = await loadInstallId(tmpdir('sg2'), 'HCU-SGTIN-123');
	assert.ok(isHex64(idA), 'sgtin-derived id is 64 hex');
	assert.strictEqual(idA, idB, 'same sgtin → same id across installs');
	assert.ok(!idA.includes('HCU-SGTIN'), 'raw sgtin never present in id');

	console.log('OTA + ANALYTICS TESTS OK');
	process.exit(0);
})().catch(e => {
	console.error('OTA TEST FAILED:', e);
	process.exit(1);
});
