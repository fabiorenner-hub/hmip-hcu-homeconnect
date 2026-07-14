'use strict';

/**
 * E2E test for the new dashboard:
 *  - boots Plugin against a non-existent HCU
 *  - starts dashboard on a free port
 *  - hits all routes
 *  - opens the WebSocket and waits for a snapshot push
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { Plugin } = require('../src/index');

(async () => {
	const tokenFile = path.join(__dirname, '..', 'data', 'TOKEN');
	fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
	fs.writeFileSync(tokenFile, 'fake-token');

	const plugin = new Plugin({
		pluginId: 'de.kiro.plugin.homeconnect.test',
		host: '127.0.0.1',
		tokenFile,
	});
	plugin.setup.start = () => {};

	const PORT = 18133;
	plugin.dashboard.start(PORT);
	await sleep(300);

	// Hit every HTTP endpoint
	const html = await get(`http://127.0.0.1:${PORT}/`);
	assert.ok(html.includes('HMIP HomeConnect'));
	assert.ok(html.includes('data-tab="overview"'));
	assert.ok(html.includes('data-tab="devices"'));
	assert.ok(html.includes('data-tab="events"'));
	assert.ok(html.includes('data-tab="energy"'));
	assert.ok(html.includes('data-tab="updates"'));
	assert.ok(html.includes('data-tab="logs"'));
	assert.ok(html.includes('id="otaInstallBtn"'));

	const state = JSON.parse(await get(`http://127.0.0.1:${PORT}/api/state`));
	assert.strictEqual(state.pluginId, 'de.kiro.plugin.homeconnect.test');
	assert.ok(Array.isArray(state.hcuDevices));
	assert.ok(state.rateLimit);
	assert.ok(state.ota, 'snapshot includes ota status');
	assert.strictEqual(state.ota.channel, 'stable');
	assert.strictEqual(state.ota.mode, 'auto', 'OTA auto is default');

	// otaStatus action works
	const otaStatus = JSON.parse(await post(`http://127.0.0.1:${PORT}/api/action`, { action: 'otaStatus' }));
	assert.strictEqual(otaStatus.ok, true);
	assert.ok(otaStatus.status && otaStatus.status.coreVersion);

	const dl = await get(`http://127.0.0.1:${PORT}/api/state.json`);
	assert.ok(dl.startsWith('{'));

	const logs = JSON.parse(await get(`http://127.0.0.1:${PORT}/api/logs?n=10`));
	assert.ok(Array.isArray(logs));

	const hcuHist = JSON.parse(await get(`http://127.0.0.1:${PORT}/api/hcu-history`));
	assert.ok(Array.isArray(hcuHist));
	const sseHist = JSON.parse(await get(`http://127.0.0.1:${PORT}/api/sse-history`));
	assert.ok(Array.isArray(sseHist));

	// POST /api/action with a known-fail action (no auth available, but it should not crash)
	const actRes = JSON.parse(await post(`http://127.0.0.1:${PORT}/api/action`, { action: 'sendTestUserMessage' }));
	assert.strictEqual(typeof actRes.ok, 'boolean');
	const unknownAct = JSON.parse(await post(`http://127.0.0.1:${PORT}/api/action`, { action: 'doesNotExist' }));
	assert.strictEqual(unknownAct.ok, false);

	// POST /api/raw without proper validation
	const rawNoBody = JSON.parse(await post(`http://127.0.0.1:${PORT}/api/raw`, {}));
	assert.ok(rawNoBody.error);

	// WebSocket: expect at least one snapshot push within 3 s
	const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
	const got = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('no snapshot received')), 3000);
		ws.on('message', m => {
			const parsed = JSON.parse(m.toString());
			if (parsed.type === 'snapshot' || parsed.type === 'logs') {
				clearTimeout(timer);
				resolve(parsed);
			}
		});
		ws.on('error', reject);
	});
	assert.ok(got.type);
	ws.close();

	plugin.dashboard.stop();
	console.log('DASHBOARD E2E OK');
	process.exit(0);
})().catch(e => {
	console.error('DASHBOARD E2E FAILED:', e);
	process.exit(1);
});

function get(u) {
	return new Promise((resolve, reject) => {
		http.get(u, res => {
			let d = '';
			res.on('data', c => (d += c));
			res.on('end', () => resolve(d));
		}).on('error', reject);
	});
}
function post(u, body) {
	const data = JSON.stringify(body);
	return new Promise((resolve, reject) => {
		const url = new URL(u);
		const req = http.request({
			hostname: url.hostname, port: url.port, path: url.pathname,
			method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
		}, res => {
			let d = '';
			res.on('data', c => (d += c));
			res.on('end', () => resolve(d));
		});
		req.on('error', reject);
		req.write(data); req.end();
	});
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
