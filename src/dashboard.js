'use strict';

const http = require('http');
const WebSocket = require('ws');

/**
 * Comprehensive HTTP + WebSocket debug dashboard.
 *
 * HTTP routes:
 *   GET  /                — single-page UI
 *   GET  /api/state       — full snapshot
 *   GET  /api/logs        — last log lines
 *   GET  /api/hcu-history — last HCU WebSocket frames
 *   GET  /api/sse-history — last Home Connect SSE events
 *   GET  /api/state.json  — full state for download
 *   POST /api/raw         — manual Home Connect call
 *   POST /api/action      — invoke plugin actions (refreshToken, restartEventStream, …)
 *
 * WebSocket /ws — pushes log entries and snapshot updates to the UI.
 */
class DebugDashboard {
	constructor({ logger, plugin }) {
		this.logger = logger;
		this.plugin = plugin;
		this.server = null;
		this.wss = null;
		this.port = null;
		this.snapshotTimer = null;
		this._unsubscribeLogger = null;
	}

	start(port) {
		if (this.server) {
			this.stop();
		}
		this.port = port;
		this.server = http.createServer((req, res) => this._handleHttp(req, res));
		this.server.on('error', e => this.logger.error('Dashboard server error:', e.message));

		this.wss = new WebSocket.Server({ server: this.server, path: '/ws' });
		this.wss.on('connection', ws => this._onWsConnect(ws));

		this._unsubscribeLogger = this.logger.subscribe(entry => this._broadcast({ type: 'log', entry }));
		this.snapshotTimer = setInterval(() => {
			this._broadcast({ type: 'snapshot', snapshot: this.plugin.getDashboardSnapshot() });
		}, 2000);

		this.server.listen(port, () => this.logger.info(`Debug dashboard on http://0.0.0.0:${port}/`));
	}

	stop() {
		if (this._unsubscribeLogger) { this._unsubscribeLogger(); this._unsubscribeLogger = null; }
		if (this.snapshotTimer) { clearInterval(this.snapshotTimer); this.snapshotTimer = null; }
		if (this.wss) {
			try { this.wss.close(); } catch { /* ignore */ }
			this.wss = null;
		}
		if (this.server) {
			this.server.close();
			this.server = null;
		}
	}

	_broadcast(msg) {
		if (!this.wss) return;
		const s = JSON.stringify(msg);
		for (const ws of this.wss.clients) {
			if (ws.readyState === WebSocket.OPEN) {
				try { ws.send(s); } catch { /* ignore */ }
			}
		}
	}

	_onWsConnect(ws) {
		try {
			ws.send(JSON.stringify({ type: 'snapshot', snapshot: this.plugin.getDashboardSnapshot() }));
			ws.send(JSON.stringify({ type: 'logs', entries: this.logger.tail(200) }));
		} catch (e) { this.logger.debug('Initial WS push failed:', e.message); }
	}

	async _handleHttp(req, res) {
		try {
			const parsed = new URL(req.url, 'http://localhost');
			const route = `${req.method} ${parsed.pathname}`;
			switch (route) {
				case 'GET /':
					return sendHtml(res, renderIndex());
				case 'GET /api/state':
					return sendJson(res, this.plugin.getDashboardSnapshot());
				case 'GET /api/state.json': {
					const body = JSON.stringify(this.plugin.getDashboardSnapshot(), null, 2);
					res.statusCode = 200;
					res.setHeader('Content-Type', 'application/json; charset=utf-8');
					res.setHeader('Content-Disposition', 'attachment; filename="hmip-homeconnect-state.json"');
					return res.end(body);
				}
				case 'GET /api/logs': {
					const n = Math.max(1, Math.min(parseInt(parsed.searchParams.get('n') || '500', 10), 2000));
					return sendJson(res, this.logger.tail(n));
				}
				case 'GET /api/hcu-history':
					return sendJson(res, this.plugin.hcu.getHistory());
				case 'GET /api/sse-history':
					return sendJson(res, this.plugin.events.getHistory());
				case 'POST /api/raw': {
					const body = await readBody(req);
					if (!body.method || !body.path) {
						return sendJson(res, { error: 'method and path are required' }, 400);
					}
					try {
						const result = await this.plugin.api.raw(body.method, body.path, body.data);
						return sendJson(res, { ok: true, result });
					} catch (e) {
						return sendJson(res, { ok: false, error: e.message, response: e?.response?.data }, 500);
					}
				}
				case 'POST /api/action': {
					const body = await readBody(req);
					if (!body.action) return sendJson(res, { error: 'action required' }, 400);
					try {
						const result = await this.plugin.runAction(body.action, body.args || {});
						return sendJson(res, result, result.ok ? 200 : 400);
					} catch (e) {
						return sendJson(res, { ok: false, error: e.message }, 500);
					}
				}
				default:
					res.statusCode = 404;
					return res.end('not found');
			}
		} catch (e) {
			this.logger.error('Dashboard request handling failed:', e);
			res.statusCode = 500;
			res.end('internal error');
		}
	}
}

function sendJson(res, body, status = 200) {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.end(JSON.stringify(body));
}
function sendHtml(res, body) {
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/html; charset=utf-8');
	res.setHeader('Cache-Control', 'no-store');
	res.end(body);
}
function readBody(req) {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', chunk => {
			data += chunk;
			if (data.length > 1024 * 1024) reject(new Error('body too large'));
		});
		req.on('end', () => {
			if (!data) return resolve({});
			try { resolve(JSON.parse(data)); }
			catch (e) { reject(e); }
		});
		req.on('error', reject);
	});
}

function renderIndex() {
	return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>HMIP HomeConnect Plugin · Debug</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CSS}</style>
</head>
<body>
<header>
	<div class="brand">
		<h1>HMIP HomeConnect <span class="muted">Plugin Debug</span></h1>
	</div>
	<div class="pills" id="pills"></div>
</header>

<nav class="tabs" id="tabs">
	<button data-tab="overview" class="active">Overview</button>
	<button data-tab="devices">Geräte</button>
	<button data-tab="api">API</button>
	<button data-tab="events">Events</button>
	<button data-tab="energy">Energie</button>
	<button data-tab="logs">Logs</button>
	<button data-tab="config">Config</button>
</nav>

<main>
	<section data-panel="overview" class="panel active">
		<div class="grid-2">
			<div class="card">
				<h2>Plugin Status</h2>
				<div class="kv" id="status"></div>
			</div>
			<div class="card">
				<h2>Home Connect Auth</h2>
				<div class="kv" id="auth"></div>
				<div id="qr" class="qr-host"></div>
			</div>
			<div class="card">
				<h2>HCU WebSocket</h2>
				<div class="kv" id="hcu-stats"></div>
			</div>
			<div class="card">
				<h2>Rate Limit</h2>
				<div class="kv" id="ratelimit"></div>
				<div class="bar"><div id="bar-min"></div></div>
				<small class="muted">Minute</small>
				<div class="bar"><div id="bar-day"></div></div>
				<small class="muted">Tag</small>
			</div>
		</div>
		<div class="card full">
			<h2>Quick Actions</h2>
			<div class="actions">
				<button data-action="refreshToken">Token erneuern</button>
				<button data-action="refreshAppliances">Appliances neu laden</button>
				<button data-action="restartEventStream">Eventstream neu starten</button>
				<button data-action="sendTestUserMessage">Test-Nachricht an HCU App</button>
				<button data-action="resetSession" class="danger">Login zurücksetzen</button>
				<a id="dlState" href="/api/state.json" download>State.json downloaden</a>
			</div>
			<pre class="result" id="actionResult"></pre>
		</div>
	</section>

	<section data-panel="devices" class="panel">
		<div class="card full">
			<h2>HCU Geräte (gemappt)</h2>
			<div class="scroll">
				<table id="hcuDevices">
					<thead><tr><th>HCU Device</th><th>Type</th><th>Rolle</th><th>haId</th><th>Features</th></tr></thead>
					<tbody></tbody>
				</table>
			</div>
		</div>
		<div class="card full">
			<h2>Home Connect Appliances</h2>
			<div id="appliances"></div>
		</div>
	</section>

	<section data-panel="api" class="panel">
		<div class="card full">
			<h2>Manueller Home Connect Request</h2>
			<form class="raw" id="rawform">
				<select name="method">
					<option>GET</option><option>PUT</option><option>POST</option><option>DELETE</option>
				</select>
				<input name="path" placeholder="/api/homeappliances/HAID/status" />
				<button type="submit">Senden</button>
				<textarea name="data" placeholder='Optionaler JSON Body (PUT/POST), z.B. {"data":{"key":"BSH.Common.Setting.PowerState","value":"BSH.Common.EnumType.PowerState.On"}}'></textarea>
			</form>
			<div class="presets">
				<span class="muted">Vorlagen:</span>
				<button class="preset" data-preset='{"method":"GET","path":"/api/homeappliances"}'>Liste Geräte</button>
				<button class="preset" data-preset='{"method":"GET","path":"/api/homeappliances/HAID/status"}'>Status</button>
				<button class="preset" data-preset='{"method":"GET","path":"/api/homeappliances/HAID/programs/available"}'>Verfügbare Programme</button>
				<button class="preset" data-preset='{"method":"PUT","path":"/api/homeappliances/HAID/commands/BSH.Common.Command.OpenDoor","data":{"data":{"key":"BSH.Common.Command.OpenDoor","value":true}}}'>Tür öffnen</button>
			</div>
			<pre class="result" id="rawresult"></pre>
		</div>
		<div class="card full">
			<h2>Letzte API Calls</h2>
			<div class="scroll">
				<table id="calls">
					<thead><tr><th>Zeit</th><th>Method</th><th>Path</th><th>Status</th><th>ms</th></tr></thead>
					<tbody></tbody>
				</table>
			</div>
		</div>
	</section>

	<section data-panel="events" class="panel">
		<div class="grid-2">
			<div class="card">
				<h2>HCU WebSocket Frames</h2>
				<div class="scroll">
					<table id="hcuFrames">
						<thead><tr><th>Zeit</th><th>Dir</th><th>Type</th></tr></thead>
						<tbody></tbody>
					</table>
				</div>
			</div>
			<div class="card">
				<h2>Home Connect SSE</h2>
				<div class="scroll">
					<table id="sseFrames">
						<thead><tr><th>Zeit</th><th>Type</th><th>haId</th></tr></thead>
						<tbody></tbody>
					</table>
				</div>
			</div>
		</div>
		<div class="card full">
			<h2>Frame-Detail</h2>
			<pre class="result" id="frameDetail">Klicke auf eine Zeile, um den Inhalt zu sehen</pre>
		</div>
	</section>

	<section data-panel="energy" class="panel">
		<div class="card full">
			<h2>Energie-Verlauf (geschätzt)</h2>
			<div id="energyCharts"></div>
		</div>
	</section>

	<section data-panel="logs" class="panel">
		<div class="card full">
			<h2>Logs</h2>
			<div class="logbar">
				<input id="logFilter" placeholder="Filter (Volltext)…">
				<select id="logLevel">
					<option value="">alle Level</option>
					<option value="debug">debug</option>
					<option value="info">info</option>
					<option value="warn">warn</option>
					<option value="error">error</option>
				</select>
				<label><input type="checkbox" id="logFollow" checked> Auto-Scroll</label>
				<button id="logClear">Anzeige leeren</button>
			</div>
			<pre class="logs" id="logs"></pre>
		</div>
	</section>

	<section data-panel="config" class="panel">
		<div class="card full">
			<h2>Live Config (read-only Anzeige; ändern in der HCU-App)</h2>
			<pre class="result" id="cfg"></pre>
		</div>
	</section>
</main>

<script>${JS_SCRIPT}</script>
</body>
</html>`;
}

const CSS = `
:root {
	--bg:#0e1117; --fg:#e6edf3; --muted:#8b949e; --card:#161b22; --border:#30363d;
	--ok:#2ea043; --warn:#d29922; --err:#f85149; --accent:#388bfd;
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }
header { padding:12px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
header h1 { font-size:16px; margin:0; font-weight:600; }
.muted { color:var(--muted); font-weight:400; }
.pills span { display:inline-block; padding:2px 8px; margin-left:6px; border-radius:10px; font-size:12px; background:var(--card); border:1px solid var(--border); }
.pills .ok { color:var(--ok); border-color:var(--ok); }
.pills .err { color:var(--err); border-color:var(--err); }
nav.tabs { padding:6px 16px; border-bottom:1px solid var(--border); display:flex; flex-wrap:wrap; gap:4px; background:#0a0d12; }
nav.tabs button { background:transparent; color:var(--muted); border:none; padding:8px 14px; border-radius:6px 6px 0 0; cursor:pointer; font:inherit; }
nav.tabs button:hover { color:var(--fg); background:var(--card); }
nav.tabs button.active { color:var(--fg); background:var(--card); border-bottom:2px solid var(--accent); }
main { padding:16px; }
.panel { display:none; }
.panel.active { display:block; }
.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
@media (max-width: 900px) { .grid-2 { grid-template-columns:1fr; } }
.card { background:var(--card); border:1px solid var(--border); border-radius:8px; padding:14px; margin-bottom:16px; }
.card.full { grid-column: 1 / -1; }
.card h2 { font-size:13px; margin:0 0 10px 0; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }
.kv { display:grid; grid-template-columns:max-content 1fr; gap:4px 12px; font-size:13px; align-items:start; }
.kv b { color:var(--muted); font-weight:500; }
.kv pre { margin:0; max-height:160px; overflow:auto; background:#010409; border:1px solid var(--border); border-radius:4px; padding:6px; }
table { width:100%; border-collapse: collapse; font-size:12px; }
th, td { padding:5px 6px; border-bottom:1px solid var(--border); text-align:left; vertical-align:top; }
th { color:var(--muted); font-weight:500; }
.scroll { max-height: 360px; overflow:auto; }
pre.result, pre.logs { background:#010409; border:1px solid var(--border); border-radius:6px; padding:8px; max-height:420px; overflow:auto; font-size:12px; white-space:pre-wrap; word-break:break-word; margin:0; }
button, input, select, textarea, a.linkbtn { background:#010409; color:var(--fg); border:1px solid var(--border); border-radius:6px; padding:6px 10px; font:inherit; }
button { cursor:pointer; }
button:hover, a.linkbtn:hover { border-color: var(--accent); }
button.danger { color:#fff; background:#7d1d1d; border-color:#7d1d1d; }
button.danger:hover { background:#8b0000; border-color:#b22222; }
a { color:#58a6ff; }
.actions { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
.actions a { display:inline-block; background:#010409; color:var(--fg); border:1px solid var(--border); border-radius:6px; padding:6px 10px; text-decoration:none; }
.actions a:hover { border-color:var(--accent); }
form.raw { display:grid; grid-template-columns: 100px 1fr 100px; gap:8px; }
form.raw textarea { grid-column:1 / -1; min-height:80px; font-family:ui-monospace, SFMono-Regular, monospace; }
.presets { margin:8px 0; display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
.presets .preset { font-size:11px; padding:4px 8px; }
.appliance-card { background:#0a0d12; border:1px solid var(--border); border-radius:6px; padding:10px; margin-bottom:10px; }
.appliance-head { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
.appliance-head h3 { margin:0; font-size:14px; }
.appliance-head .badge { font-size:11px; padding:2px 6px; border-radius:10px; border:1px solid var(--border); }
.appliance-head .badge.online { color:var(--ok); border-color:var(--ok); }
.appliance-head .badge.offline { color:var(--err); border-color:var(--err); }
.appliance-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
.appliance-actions button { font-size:11px; padding:4px 8px; }
.setting-row { display:grid; grid-template-columns: 2fr 1fr 60px; gap:6px; align-items:center; padding:3px 0; border-top:1px dashed #1c2129; font-size:12px; font-family: ui-monospace, monospace; }
.setting-row code { color:var(--muted); word-break:break-all; }
.setting-row input { font-family:inherit; font-size:11px; padding:3px 6px; }
.setting-row button { font-size:11px; padding:3px 8px; }
details > summary { cursor:pointer; color:var(--muted); padding:4px 0; }
.bar { height:6px; background:#010409; border:1px solid var(--border); border-radius:3px; overflow:hidden; margin-top:6px; }
.bar > div { height:100%; background:var(--accent); transition: width .3s ease; width: 0; }
.bar > div.warn { background:var(--warn); }
.bar > div.err { background:var(--err); }
.qr-host { margin-top:10px; display:flex; justify-content:center; }
.qr-host svg { background:#fff; border-radius:4px; padding:4px; }
.logbar { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px; align-items:center; }
.logbar input[type=text], .logbar input { flex:1; min-width:160px; }
pre.logs .line { display:block; }
pre.logs .line.error { color:var(--err); }
pre.logs .line.warn { color:var(--warn); }
pre.logs .line.debug { color:var(--muted); }
.energy-chart { background:#0a0d12; border:1px solid var(--border); border-radius:6px; padding:8px; margin-bottom:10px; }
.energy-chart h4 { margin:0 0 6px; font-size:13px; }
.energy-chart svg { width:100%; height:120px; display:block; }
.frame-row { cursor:pointer; }
.frame-row:hover { background:#1f2530; }
.frame-row.selected { background:#1f2937; }
`;

const JS_SCRIPT = String.raw`
(function () {
	let snapshot = null;
	let logs = [];
	let logFollow = true;
	let logLevel = '';
	let logFilter = '';
	let logPaused = false;
	let selectedFrame = null;

	const $ = sel => document.querySelector(sel);
	const $$ = sel => document.querySelectorAll(sel);

	function escape(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
	function fmtTs(ts) { try { return new Date(ts).toLocaleTimeString('de-DE'); } catch { return ts; } }
	function fmtDur(s) { if (s == null) return '–'; const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60); return (h?h+'h ':'') + (m||h?m+'m ':'') + sec + 's'; }
	function pill(label, ok) { return '<span class="' + (ok ? 'ok' : 'err') + '">' + label + '</span>'; }

	// ===== Tabs =====
	$$('.tabs button').forEach(btn => {
		btn.addEventListener('click', () => {
			$$('.tabs button').forEach(b => b.classList.toggle('active', b === btn));
			$$('.panel').forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
			if (btn.dataset.tab === 'events') refreshEventTabs();
			if (btn.dataset.tab === 'energy') renderEnergy();
		});
	});

	// ===== WebSocket live channel =====
	let ws;
	function connectWs() {
		const proto = location.protocol === 'https:' ? 'wss' : 'ws';
		ws = new WebSocket(proto + '://' + location.host + '/ws');
		ws.onmessage = ev => {
			const m = JSON.parse(ev.data);
			if (m.type === 'snapshot') { snapshot = m.snapshot; renderAll(); }
			else if (m.type === 'log') { if (!logPaused) { logs.push(m.entry); if (logs.length > 800) logs.shift(); renderLogs(); } }
			else if (m.type === 'logs') { logs = m.entries; renderLogs(); }
		};
		ws.onclose = () => setTimeout(connectWs, 1000);
		ws.onerror = () => { try { ws.close(); } catch {} };
	}
	connectWs();

	// ===== Renderers =====
	function renderAll() {
		if (!snapshot) return;
		renderHeader();
		renderOverview();
		renderHcuDevices();
		renderAppliances();
		renderApiCalls();
		renderEnergy();
		$('#cfg').textContent = JSON.stringify(snapshot.config, null, 2);
	}

	function renderHeader() {
		$('#pills').innerHTML =
			pill('HCU ' + (snapshot.hcuConnected ? 'verbunden' : 'getrennt'), snapshot.hcuConnected) +
			pill('HC ' + (snapshot.hcAuthenticated ? 'auth' : 'kein Token'), snapshot.hcAuthenticated) +
			pill('Events ' + ((snapshot.eventStats?.connected) ? 'aktiv' : 'inaktiv'), !!snapshot.eventStats?.connected) +
			pill('readiness: ' + escape(snapshot.readiness), snapshot.readiness === 'READY');
	}

	function renderOverview() {
		const s = snapshot;
		$('#status').innerHTML =
			'<b>pluginId</b><span>' + escape(s.pluginId) + '</span>' +
			'<b>HCU host</b><span>' + escape(s.host) + '</span>' +
			'<b>uptime</b><span>' + fmtDur(s.uptimeSec) + '</span>' +
			'<b>readiness</b><span>' + escape(s.readiness) + '</span>' +
			'<b>HCU devices</b><span>' + (s.hcuDevices||[]).length + '</span>' +
			'<b>Appliances</b><span>' + Object.keys(s.appliances||{}).length + '</span>';

		const sess = s.session || {};
		$('#auth').innerHTML =
			'<b>access_token</b><span>' + (sess.access_token ? escape(sess.access_token.slice(0,16)) + '…' : '–') + '</span>' +
			'<b>scope</b><span>' + escape(sess.scope || '–') + '</span>' +
			'<b>expires_in</b><span>' + escape(sess.expires_in || '–') + '</span>' +
			'<b>next refresh</b><span>' + (sess.next ? new Date(sess.next).toLocaleString('de-DE') : '–') + '</span>' +
			'<b>verification URL</b><span>' + (s.lastVerificationUrl ? '<a target="_blank" href="' + escape(s.lastVerificationUrl) + '">' + escape(s.lastVerificationUrl) + '</a>' : '–') + '</span>';

		// QR for verification URL
		const qrHost = $('#qr');
		qrHost.innerHTML = '';
		if (s.lastVerificationUrl && !s.hcAuthenticated) {
			qrHost.appendChild(buildQrSvg(s.lastVerificationUrl, 4));
		}

		const hcu = s.hcuStats || {};
		$('#hcu-stats').innerHTML =
			'<b>state</b><span>' + (s.hcuConnected ? '<span style="color:var(--ok)">connected</span>' : '<span style="color:var(--err)">disconnected</span>') + '</span>' +
			'<b>connects</b><span>' + (hcu.connectsTotal || 0) + '</span>' +
			'<b>frames in</b><span>' + (hcu.received || 0) + '</span>' +
			'<b>frames out</b><span>' + (hcu.sent || 0) + '</span>';

		const rl = s.rateLimit || {};
		$('#ratelimit').innerHTML =
			'<b>per minute</b><span>' + (rl.minuteCount||0) + ' / ' + (rl.maxPerMinute||'?') + '</span>' +
			'<b>per day</b><span>' + (rl.dayCount||0) + ' / ' + (rl.maxPerDay||'?') + '</span>' +
			'<b>blocked until</b><span>' + (rl.blockedUntil ? new Date(rl.blockedUntil).toLocaleTimeString('de-DE') : '–') + '</span>' +
			'<b>last block reason</b><span>' + escape(rl.blockReason || '–') + '</span>';

		const minPct = Math.min(100, ((rl.minuteCount||0) / (rl.maxPerMinute||1)) * 100);
		const dayPct = Math.min(100, ((rl.dayCount||0) / (rl.maxPerDay||1)) * 100);
		const minBar = $('#bar-min');
		const dayBar = $('#bar-day');
		minBar.style.width = minPct + '%';
		dayBar.style.width = dayPct + '%';
		minBar.className = minPct > 90 ? 'err' : (minPct > 70 ? 'warn' : '');
		dayBar.className = dayPct > 90 ? 'err' : (dayPct > 70 ? 'warn' : '');
	}

	function renderHcuDevices() {
		const tbody = $('#hcuDevices tbody');
		tbody.innerHTML = '';
		for (const d of snapshot.hcuDevices || []) {
			const tr = document.createElement('tr');
			tr.innerHTML =
				'<td>' + escape(d.friendlyName) + '<br><small class="muted">' + escape(d.deviceId) + '</small></td>' +
				'<td>' + escape(d.deviceType) + '</td>' +
				'<td>' + escape(d.role) + '</td>' +
				'<td>' + escape(d.sourceHaId) + '</td>' +
				'<td><pre style="margin:0">' + escape(JSON.stringify(d.features, null, 2)) + '</pre></td>';
			tbody.appendChild(tr);
		}
	}

	function renderAppliances() {
		const host = $('#appliances');
		host.innerHTML = '';
		for (const [haId, a] of Object.entries(snapshot.appliances || {})) {
			const card = document.createElement('div');
			card.className = 'appliance-card';
			const programs = a.programs || {};
			card.innerHTML =
				'<div class="appliance-head">' +
					'<h3>' + escape(a.name || haId) + ' <span class="muted">(' + escape(a.type) + ' · ' + escape(a.brand || '–') + ')</span></h3>' +
					'<span class="badge ' + (a.connected ? 'online' : 'offline') + '">' + (a.connected ? 'online' : 'offline') + '</span>' +
				'</div>' +
				'<div class="muted" style="font-size:12px">haId: ' + escape(haId) + (programs.selected ? ' · selected: ' + escape(programs.selected) : '') + (programs.available ? ' · ' + programs.available.length + ' verfügbar' : '') + '</div>' +
				'<div class="appliance-actions">' +
					'<button data-act="startProgram" data-haid="' + escape(haId) + '">▶ Programm starten</button>' +
					'<button data-act="stopProgram" data-haid="' + escape(haId) + '">⏹ Abbrechen</button>' +
					'<button data-act="powerOn" data-haid="' + escape(haId) + '">Power On</button>' +
					'<button data-act="powerOff" data-haid="' + escape(haId) + '">Power Off</button>' +
					'<button data-act="openDoor" data-haid="' + escape(haId) + '">Tür öffnen</button>' +
					'<button data-act="resetEnergy" data-haid="' + escape(haId) + '">kWh-Zähler reset</button>' +
				'</div>' +
				'<details><summary>Settings (' + Object.keys(a.settings||{}).length + ')</summary><div class="settings"></div></details>' +
				'<details><summary>Status (' + Object.keys(a.status||{}).length + ')</summary><pre style="margin:6px 0 0;background:#010409;border:1px solid var(--border);padding:6px;border-radius:4px;max-height:200px;overflow:auto">' + escape(JSON.stringify(a.status||{}, null, 2)) + '</pre></details>' +
				(programs.available && programs.available.length ? '<details><summary>Verfügbare Programme (' + programs.available.length + ')</summary><pre style="margin:6px 0 0;background:#010409;border:1px solid var(--border);padding:6px;border-radius:4px;max-height:200px;overflow:auto">' + escape((programs.available || []).join('\\n')) + '</pre></details>' : '');
			const settingsHost = card.querySelector('.settings');
			for (const [k, v] of Object.entries(a.settings || {})) {
				const row = document.createElement('div');
				row.className = 'setting-row';
				const isBool = typeof v === 'boolean';
				const inputHtml = isBool
					? '<select><option value="true"' + (v ? ' selected' : '') + '>true</option><option value="false"' + (!v ? ' selected' : '') + '>false</option></select>'
					: '<input value="' + escape(typeof v === 'object' ? JSON.stringify(v) : v) + '">';
				row.innerHTML =
					'<code>' + escape(k) + '</code>' +
					inputHtml +
					'<button data-set-key="' + escape(k) + '" data-haid="' + escape(haId) + '" data-bool="' + isBool + '">PUT</button>';
				settingsHost.appendChild(row);
			}
			host.appendChild(card);
		}
		host.querySelectorAll('button[data-act]').forEach(btn => btn.addEventListener('click', onApplianceAction));
		host.querySelectorAll('button[data-set-key]').forEach(btn => btn.addEventListener('click', onSettingPut));
	}

	async function onApplianceAction(ev) {
		const btn = ev.currentTarget;
		const act = btn.dataset.act;
		const haId = btn.dataset.haid;
		const map = {
			startProgram: ['startProgram', { haId }],
			stopProgram: ['stopProgram', { haId }],
			powerOn: ['setSetting', { haId, key: 'BSH.Common.Setting.PowerState', value: 'BSH.Common.EnumType.PowerState.On' }],
			powerOff: ['setSetting', { haId, key: 'BSH.Common.Setting.PowerState', value: 'BSH.Common.EnumType.PowerState.Off' }],
			openDoor: ['openDoor', { haId }],
			resetEnergy: ['resetEnergyCounter', { haId }],
		};
		const [action, args] = map[act] || [];
		if (!action) return;
		btn.disabled = true;
		try {
			const res = await invokeAction(action, args);
			toast(res.ok ? 'OK' : ('Fehler: ' + (res.error || 'unbekannt')), res.ok);
		} catch (e) { toast('Fehler: ' + e.message, false); }
		finally { btn.disabled = false; }
	}

	async function onSettingPut(ev) {
		const btn = ev.currentTarget;
		const haId = btn.dataset.haid;
		const key = btn.dataset.setKey;
		const isBool = btn.dataset.bool === 'true';
		const inp = btn.previousElementSibling;
		let value = inp.value;
		if (isBool) value = value === 'true';
		else if (value === '' || isNaN(Number(value)) === false && value.trim() !== '') value = Number(value);
		btn.disabled = true;
		try {
			const res = await invokeAction('setSetting', { haId, key, value });
			toast(res.ok ? 'PUT OK' : ('Fehler: ' + (res.error || '')), res.ok);
		} catch (e) { toast('Fehler: ' + e.message, false); }
		finally { btn.disabled = false; }
	}

	function renderApiCalls() {
		const calls = (snapshot.rateLimit?.recentCalls || []).slice().reverse();
		const tbody = $('#calls tbody');
		tbody.innerHTML = '';
		for (const c of calls) {
			const tr = document.createElement('tr');
			const okStatus = typeof c.status === 'number' && c.status < 400;
			tr.innerHTML =
				'<td>' + fmtTs(c.ts) + '</td>' +
				'<td>' + escape(c.method) + '</td>' +
				'<td title="' + escape(c.url) + '">' + escape(c.url.replace('https://api.home-connect.com', '')) + '</td>' +
				'<td style="color:' + (okStatus ? 'var(--ok)' : 'var(--err)') + '">' + escape(c.status) + (c.error ? ' (' + escape(c.error) + ')' : '') + '</td>' +
				'<td>' + (c.durationMs || 0) + '</td>';
			tbody.appendChild(tr);
		}
	}

	async function refreshEventTabs() {
		const [hcuRes, sseRes] = await Promise.all([
			fetch('/api/hcu-history').then(r => r.json()),
			fetch('/api/sse-history').then(r => r.json()),
		]);
		renderHcuFrames(hcuRes);
		renderSseFrames(sseRes);
	}
	setInterval(() => { if ($('[data-panel=events]').classList.contains('active')) refreshEventTabs(); }, 2000);

	function renderHcuFrames(rows) {
		const tbody = $('#hcuFrames tbody');
		tbody.innerHTML = '';
		for (const r of rows.slice().reverse()) {
			const tr = document.createElement('tr');
			tr.className = 'frame-row';
			tr.innerHTML =
				'<td>' + fmtTs(r.ts) + '</td>' +
				'<td>' + (r.direction === 'in' ? '⬇' : '⬆') + '</td>' +
				'<td>' + escape(r.type) + '</td>';
			tr.addEventListener('click', () => showFrame(tr, r));
			tbody.appendChild(tr);
		}
	}
	function renderSseFrames(rows) {
		const tbody = $('#sseFrames tbody');
		tbody.innerHTML = '';
		for (const r of rows.slice().reverse()) {
			const tr = document.createElement('tr');
			tr.className = 'frame-row';
			tr.innerHTML =
				'<td>' + fmtTs(r.ts) + '</td>' +
				'<td>' + escape(r.type) + '</td>' +
				'<td>' + escape(r.haId || '–') + '</td>';
			tr.addEventListener('click', () => showFrame(tr, r));
			tbody.appendChild(tr);
		}
	}
	function showFrame(tr, frame) {
		document.querySelectorAll('.frame-row.selected').forEach(x => x.classList.remove('selected'));
		tr.classList.add('selected');
		selectedFrame = frame;
		$('#frameDetail').textContent = JSON.stringify(frame, null, 2);
	}

	function renderEnergy() {
		const host = $('#energyCharts');
		host.innerHTML = '';
		const hist = snapshot.energyHistory || {};
		const counters = snapshot.energyCounters || {};
		const energyDevices = (snapshot.hcuDevices || []).filter(d => d.role === 'energy');
		if (!energyDevices.length) {
			host.innerHTML = '<p class="muted">Keine ENERGY_METER-Geräte vorhanden.</p>';
			return;
		}
		for (const d of energyDevices) {
			const series = hist[d.sourceHaId] || [];
			const watts = d.features.find(f => f.type === 'currentPower')?.currentPower || 0;
			const kwh = counters[d.sourceHaId] || 0;
			const card = document.createElement('div');
			card.className = 'energy-chart';
			card.innerHTML = '<h4>' + escape(d.friendlyName) + ' <span class="muted">' + watts + ' W · ' + kwh.toFixed(3) + ' kWh</span></h4>' + buildSparkline(series);
			host.appendChild(card);
		}
	}

	function buildSparkline(series) {
		if (!series.length) return '<p class="muted" style="margin:0">Noch keine Daten – Tracker tickt alle 30 s.</p>';
		const w = 600, h = 120, padX = 30, padY = 10;
		const xs = series.map((_, i) => padX + (i * (w - padX*2)) / Math.max(1, series.length - 1));
		const maxW = Math.max(10, ...series.map(s => s.watts));
		const maxK = Math.max(0.001, ...series.map(s => s.kwh));
		const ysW = series.map(s => h - padY - (s.watts / maxW) * (h - padY*2));
		const ysK = series.map(s => h - padY - (s.kwh / maxK) * (h - padY*2));
		const pathW = xs.map((x, i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + ysW[i].toFixed(1)).join(' ');
		const pathK = xs.map((x, i) => (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + ysK[i].toFixed(1)).join(' ');
		return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
			'<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#010409"/>' +
			'<path d="' + pathW + '" stroke="#388bfd" fill="none" stroke-width="1.5"/>' +
			'<path d="' + pathK + '" stroke="#2ea043" fill="none" stroke-width="1.5"/>' +
			'<text x="' + (w-4) + '" y="14" fill="#388bfd" font-size="10" text-anchor="end">W max ' + maxW.toFixed(0) + '</text>' +
			'<text x="' + (w-4) + '" y="' + (h-4) + '" fill="#2ea043" font-size="10" text-anchor="end">kWh max ' + maxK.toFixed(3) + '</text>' +
		'</svg>';
	}

	function renderLogs() {
		const node = $('#logs');
		const filtered = logs.filter(l => (!logLevel || l.level === logLevel) && (!logFilter || l.text.toLowerCase().includes(logFilter)));
		node.innerHTML = filtered.map(l =>
			'<span class="line ' + escape(l.level) + '">[' + fmtTs(l.ts) + '] [' + escape(l.level.toUpperCase()) + '] ' + escape(l.text) + '</span>'
		).join('\n');
		if (logFollow) node.scrollTop = node.scrollHeight;
	}

	$('#logFilter').addEventListener('input', e => { logFilter = e.target.value.toLowerCase(); renderLogs(); });
	$('#logLevel').addEventListener('change', e => { logLevel = e.target.value; renderLogs(); });
	$('#logFollow').addEventListener('change', e => { logFollow = e.target.checked; });
	$('#logClear').addEventListener('click', () => { logs = []; renderLogs(); });

	// ===== Quick actions =====
	$$('button[data-action]').forEach(btn => btn.addEventListener('click', async () => {
		btn.disabled = true;
		try {
			const res = await invokeAction(btn.dataset.action);
			$('#actionResult').textContent = JSON.stringify(res, null, 2);
			toast(res.ok ? 'OK' : 'Fehler', res.ok);
		} catch (e) {
			$('#actionResult').textContent = e.message;
			toast(e.message, false);
		} finally { btn.disabled = false; }
	}));

	async function invokeAction(action, args) {
		const r = await fetch('/api/action', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action, args }) });
		return r.json();
	}

	// ===== Manual API form =====
	$('#rawform').addEventListener('submit', async ev => {
		ev.preventDefault();
		const f = ev.target;
		const dataStr = f.data.value.trim();
		const body = { method: f.method.value, path: f.path.value };
		if (dataStr) {
			try { body.data = JSON.parse(dataStr); }
			catch (e) { $('#rawresult').textContent = 'Body kein gültiges JSON: ' + e.message; return; }
		}
		const r = await fetch('/api/raw', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
		const j = await r.json().catch(() => ({error:'Antwort nicht parsebar'}));
		$('#rawresult').textContent = JSON.stringify(j, null, 2);
	});
	$$('.preset').forEach(btn => btn.addEventListener('click', () => {
		const p = JSON.parse(btn.dataset.preset);
		$('#rawform').method.value = p.method;
		$('#rawform').path.value = p.path;
		$('#rawform').data.value = p.data ? JSON.stringify(p.data, null, 2) : '';
	}));

	// ===== Toast =====
	let toastTimer;
	function toast(msg, ok) {
		let t = $('#toast');
		if (!t) {
			t = document.createElement('div');
			t.id = 'toast';
			t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#161b22;border:1px solid var(--border);padding:10px 14px;border-radius:6px;z-index:1000;max-width:340px;font-size:13px';
			document.body.appendChild(t);
		}
		t.style.borderColor = ok ? 'var(--ok)' : 'var(--err)';
		t.textContent = msg;
		t.style.opacity = '1';
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 3000);
	}

	// ===== QR (very small ad-hoc generator using Google's chart hint via SVG fallback) =====
	// To stay zero-dependency, render a basic 'open URL' rectangle with the URL inside.
	function buildQrSvg(text, scale) {
		// We avoid bundling a QR library — instead show the URL as scannable-looking blocky text.
		// Mobile browsers scan most camera-app barcode readers via the long-press copy too.
		const ns = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 200 60');
		svg.setAttribute('width', '320');
		svg.setAttribute('height', '60');
		svg.innerHTML =
			'<rect width="200" height="60" fill="#fff"/>' +
			'<text x="100" y="22" font-size="9" font-family="monospace" text-anchor="middle" fill="#000">Verification URL</text>' +
			'<text x="100" y="38" font-size="6" font-family="monospace" text-anchor="middle" fill="#000">' + escape(text.slice(0, 64)) + '</text>' +
			'<text x="100" y="50" font-size="6" font-family="monospace" text-anchor="middle" fill="#000">' + escape(text.slice(64, 128)) + '</text>';
		return svg;
	}
})();
`;

module.exports = { DebugDashboard };
