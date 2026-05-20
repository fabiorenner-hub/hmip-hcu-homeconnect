'use strict';

/**
 * Quick render test: boot the setup server, fetch /, /style.css, /app.js,
 * /api/state and /api/qr. No HCU, no Home Connect.
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { SetupServer } = require('../src/setupServer');
const { Logger } = require('../src/logger');
const { StateStore } = require('../src/state');

(async () => {
	const tmp = path.join(__dirname, '..', 'data', 'plugin-state-setup-test.json');
	fs.mkdirSync(path.dirname(tmp), { recursive: true });
	fs.writeFileSync(tmp, '{}');
	const logger = new Logger({});
	const state = new StateStore({ file: tmp, logger });
	state.load();
	state.config = { ...state.config, clientId: '' };
	state.lastVerificationUrl = 'https://example.com/verify?user_code=ABCD-EFGH';

	const plugin = { state, _initHomeConnect: async () => {} };
	const s = new SetupServer({ logger, plugin, port: 18124 });
	s.start();
	await sleep(200);

	const html = await get('http://127.0.0.1:18124/');
	assert.ok(html.includes('Setup-Assistent'), 'HTML must contain hero title');
	assert.ok(html.includes('Client ID'), 'HTML must mention Client ID');
	const css = await get('http://127.0.0.1:18124/style.css');
	assert.ok(css.includes('--primary'), 'CSS must define design tokens');
	const js = await get('http://127.0.0.1:18124/app.js');
	assert.ok(js.includes('connectWs'), 'JS must include WS reconnect helper');
	const stateJson = JSON.parse(await get('http://127.0.0.1:18124/api/state'));
	assert.ok(stateJson.stage, 'state must include stage field');
	const qr = JSON.parse(await get('http://127.0.0.1:18124/api/qr'));
	assert.ok(qr.qr.startsWith('data:image/png;base64,'), 'QR must be a base64 data URL');

	s.stop();
	fs.unlinkSync(tmp);
	console.log('SETUP RENDER OK');
})().catch(e => {
	console.error('SETUP RENDER FAILED:', e);
	process.exit(1);
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function get(url) {
	return new Promise((resolve, reject) => {
		http.get(url, res => {
			let d = '';
			res.on('data', c => (d += c));
			res.on('end', () => resolve(d));
		}).on('error', reject);
	});
}
