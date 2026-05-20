'use strict';

const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const QRCode = require('qrcode');

/**
 * Self-contained Setup Wizard.
 *
 * Runs as long as the plugin is not authenticated against Home Connect.
 * Once a valid access token is present, the server stops itself and
 * the page becomes unreachable — so the wizard cannot be used to leak
 * the verification URL after login is complete.
 *
 * URL: http://<HCU-IP>:8124/
 */
class SetupServer {
	constructor({ logger, plugin, port = 8124 }) {
		this.logger = logger;
		this.plugin = plugin;
		this.port = port;
		this.server = null;
		this.wss = null;
		this.unsubscribeState = null;
	}

	get baseUrl() {
		const ip = bestLocalIp();
		return `http://${ip}:${this.port}/`;
	}

	start() {
		if (this.server) return;
		this.server = http.createServer((req, res) => this._handle(req, res));
		this.wss = new WebSocket.Server({ server: this.server, path: '/ws' });
		this.wss.on('connection', ws => {
			ws.send(JSON.stringify({ type: 'state', state: this._buildState() }));
		});

		this.server.listen(this.port, '0.0.0.0', () => {
			this.logger.info(`Setup wizard available at ${this.baseUrl} (open this in your browser)`);
		});
		this.server.on('error', err => {
			this.logger.error(`Setup wizard failed to bind on port ${this.port}: ${err.message}`);
		});
	}

	stop() {
		if (this._stopTimer) {
			clearTimeout(this._stopTimer);
			this._stopTimer = null;
		}
		if (!this.server) return;
		try { this.wss && this.wss.close(); } catch { /* ignore */ }
		try { this.server.close(); } catch { /* ignore */ }
		this.server = null;
		this.wss = null;
		this.logger.info('Setup wizard stopped (login complete).');
	}

	/**
	 * Stop the server after a short delay, after broadcasting the final
	 * state. Gives the wizard UI time to render the "done" stage and to
	 * trigger its own page reload.
	 */
	stopGracefully(delayMs = 5000) {
		if (!this.server) return;
		this.broadcastState();
		if (this._stopTimer) clearTimeout(this._stopTimer);
		this._stopTimer = setTimeout(() => this.stop(), delayMs);
	}

	get running() { return !!this.server; }

	/** Push the current state to all connected websockets. */
	broadcastState() {
		if (!this.wss) return;
		const msg = JSON.stringify({ type: 'state', state: this._buildState() });
		for (const client of this.wss.clients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(msg);
			}
		}
	}

	_buildState() {
		const cfg = this.plugin.state.config;
		const session = this.plugin.state.session;
		const status = this.plugin.state.lastVerificationStatus;
		const url = this.plugin.state.lastVerificationUrl;
		let stage = 'enter-client-id';
		if (cfg.clientId && cfg.clientId.length === 64) {
			stage = url && !session?.access_token ? 'awaiting-approval' : 'sign-in';
		}
		if (session?.access_token) stage = 'done';
		return {
			stage,
			clientIdSet: !!cfg.clientId,
			clientIdLength: (cfg.clientId || '').length,
			verificationUrl: url || null,
			lastError: status?.state === 'error' ? status.message : null,
			lastErrorAt: status?.state === 'error' ? status.at : null,
			loggedIn: !!session?.access_token,
			pluginVersion: this.plugin.pluginVersion || null,
		};
	}

	async _handle(req, res) {
		try {
			if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(renderHtml());
				return;
			}
			if (req.method === 'GET' && req.url === '/style.css') {
				res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
				res.end(STYLE);
				return;
			}
			if (req.method === 'GET' && req.url === '/app.js') {
				res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
				res.end(CLIENT_JS);
				return;
			}
			if (req.method === 'GET' && req.url === '/icon.svg') {
				const p = path.join(__dirname, '..', 'icon.svg');
				if (fs.existsSync(p)) {
					res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
					fs.createReadStream(p).pipe(res);
					return;
				}
			}
			if (req.method === 'GET' && req.url === '/api/state') {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify(this._buildState()));
				return;
			}
			if (req.method === 'GET' && req.url === '/api/qr') {
				const url = this.plugin.state.lastVerificationUrl;
				if (!url) {
					res.writeHead(404); res.end('no verification url'); return;
				}
				const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 280 });
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ url, qr: dataUrl }));
				return;
			}
			if (req.method === 'POST' && req.url === '/api/client-id') {
				const body = await readBody(req);
				let parsed;
				try { parsed = JSON.parse(body); } catch { parsed = {}; }
				const clientId = String(parsed.clientId || '').trim();
				if (clientId.length !== 64 || !/^[A-Za-z0-9]+$/.test(clientId)) {
					res.writeHead(400, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ ok: false, error: 'Client ID must be exactly 64 alphanumeric characters.' }));
					return;
				}
				this.plugin.state.config = { ...this.plugin.state.config, clientId, resetSession: false };
				this.plugin.state.session = null;
				this.plugin.state.lastVerificationStatus = null;
				this.plugin.state.lastVerificationUrl = null;
				this.plugin.state.save();
				this.plugin._initHomeConnect().catch(e => this.logger.error('Re-init failed:', e.message));
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ ok: true }));
				this.broadcastState();
				return;
			}
			if (req.method === 'POST' && req.url === '/api/reset') {
				this.plugin.state.session = null;
				this.plugin.state.lastVerificationStatus = null;
				this.plugin.state.lastVerificationUrl = null;
				this.plugin.state.save();
				this.plugin._initHomeConnect().catch(e => this.logger.error('Re-init failed:', e.message));
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ ok: true }));
				this.broadcastState();
				return;
			}
			res.writeHead(404, { 'Content-Type': 'text/plain' });
			res.end('not found');
		} catch (e) {
			this.logger.error(`Setup wizard handler failed: ${e.message}`);
			res.writeHead(500, { 'Content-Type': 'text/plain' });
			res.end('internal error');
		}
	}
}

/**
 * Find the most useful local IPv4 address for the user-facing URL — i.e.
 * not the loopback or container-internal `host.containers.internal`.
 */
function bestLocalIp() {
	const nets = os.networkInterfaces();
	const candidates = [];
	for (const ifaces of Object.values(nets)) {
		for (const n of ifaces || []) {
			if (n.family === 'IPv4' && !n.internal) candidates.push(n.address);
		}
	}
	// Prefer 192.168.* / 10.* over container bridges (172.16-31.*).
	candidates.sort((a, b) => rank(a) - rank(b));
	return candidates[0] || os.hostname();
}

function rank(ip) {
	if (ip.startsWith('192.168.')) return 0;
	if (ip.startsWith('10.')) return 1;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 3; // container bridge
	return 2;
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', c => { data += c; if (data.length > 65536) reject(new Error('payload too big')); });
		req.on('end', () => resolve(data));
		req.on('error', reject);
	});
}

const STYLE = require('./setup/style.js');
const CLIENT_JS = require('./setup/app.js');

function renderHtml() {
	return require('./setup/html.js')();
}

module.exports = { SetupServer };
