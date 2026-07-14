'use strict';

const fs = require('node:fs').promises;
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PLUGIN_ID } = require('../pluginMeta');

/**
 * Anonymous usage statistics ("HCU Plugin Analytics").
 *
 * Default ON, opt-out via the visible switch in the plugin configuration.
 * Transmits only pseudonymous technical metadata (schema-1 payload):
 * schema, event, installId, pluginId, coreVersion, otaVersion, buildId, arch,
 * hcuFirmware, lang, ts. Never any PII, SGTIN/serial, IPs, rooms, device
 * names/addresses, measurements, automations, schedules, config or tokens.
 *
 * Fire-and-forget: short timeouts, never blocks the plugin, silent on error,
 * with backoff so failures don't hammer the endpoint.
 */

const SCHEMA = 1;
const MAX_BYTES = 4096;
const CONNECT_TIMEOUT_MS = 3000;
const TOTAL_TIMEOUT_MS = 5000;
const HEARTBEAT_CHECK_MS = 60 * 60 * 1000; // check hourly, send at most once/interval
// Backoff after a failed send: 15 min, then 4 h, then 12 h (no fast retry).
const BACKOFF_MS = [15 * 60 * 1000, 4 * 3600 * 1000, 12 * 3600 * 1000];

// Salt so the install id is not a bare hash of a guessable seed. Not a secret.
const INSTALL_ID_SALT = 'de.fr.renner.hcu-plugin-analytics.v1';

function isHex64(s) {
	return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

/**
 * Stable, pseudonymous 64-lowercase-hex install id: sha256(salt + seed).
 * The seed is an HCU SGTIN if one is provided, otherwise a persistent random
 * value stored on /data. The raw seed/SGTIN is NEVER transmitted.
 */
async function loadInstallId(dataDir, sgtin) {
	if (sgtin) {
		return createHash('sha256').update(INSTALL_ID_SALT + String(sgtin)).digest('hex');
	}
	const p = path.join(dataDir, 'analytics-seed');
	let seed = null;
	try {
		const v = (await fs.readFile(p, 'utf8')).trim();
		if (v.length >= 8) seed = v;
	} catch { /* create below */ }
	if (!seed) {
		seed = randomUUID();
		try {
			await fs.mkdir(dataDir, { recursive: true });
			await fs.writeFile(p, `${seed}\n`, 'utf8');
		} catch { /* ignore */ }
	}
	return createHash('sha256').update(INSTALL_ID_SALT + seed).digest('hex');
}

class CallHome {
	constructor(deps) {
		this.deps = deps;
		this.timer = null;
		this.bootTimer = null;
		this.idPromise = null;
		this.stateFile = path.join(deps.dataDir, 'telemetry-state.json');
		this._mem = null; // in-memory copy of persisted telemetry state
		this._failures = 0;
		this._nextAllowedAt = 0;
	}

	_fetch(url, init) {
		const f = this.deps.fetchImpl || ((u, i) => globalThis.fetch(u, i));
		return f(url, init);
	}

	_log(lvl, msg) {
		if (this.deps.logger) this.deps.logger(lvl, `[analytics] ${msg}`);
	}

	async _readState() {
		if (this._mem) return this._mem;
		try {
			this._mem = JSON.parse(await fs.readFile(this.stateFile, 'utf8'));
		} catch {
			this._mem = {};
		}
		return this._mem;
	}

	async _writeState(patch) {
		const next = { ...(await this._readState()), ...patch };
		this._mem = next;
		try {
			await fs.mkdir(this.deps.dataDir, { recursive: true });
			const tmp = `${this.stateFile}.tmp-${process.pid}`;
			await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
			await fs.rename(tmp, this.stateFile);
		} catch { /* best-effort */ }
	}

	async installId() {
		if (!this.idPromise) this.idPromise = loadInstallId(this.deps.dataDir, this.deps.getSgtin && this.deps.getSgtin());
		return this.idPromise;
	}

	/** Full schema-1 payload for a given event (also used by the UI preview). */
	async buildPayload(event) {
		const fields = this.deps.buildFields ? this.deps.buildFields() : {};
		const payload = {
			schema: SCHEMA,
			event,
			installId: await this.installId(),
			pluginId: PLUGIN_ID,
			coreVersion: fields.coreVersion || '0.0.0',
			otaVersion: fields.otaVersion || fields.coreVersion || '0.0.0',
			ts: new Date().toISOString(),
		};
		// Optional fields (dropped first if we ever exceed the size limit).
		if (fields.buildId) payload.buildId = fields.buildId;
		if (fields.arch) payload.arch = fields.arch;
		if (fields.hcuFirmware) payload.hcuFirmware = fields.hcuFirmware;
		if (fields.lang) payload.lang = fields.lang;
		return payload;
	}

	preview(event = 'start') { return this.buildPayload(event); }

	_serialize(payload) {
		let body = JSON.stringify(payload);
		if (Buffer.byteLength(body, 'utf8') <= MAX_BYTES) return body;
		// Trim optional fields until it fits.
		for (const k of ['buildId', 'hcuFirmware', 'arch', 'lang']) {
			if (k in payload) {
				delete payload[k];
				body = JSON.stringify(payload);
				if (Buffer.byteLength(body, 'utf8') <= MAX_BYTES) return body;
			}
		}
		return body.length <= MAX_BYTES ? body : null;
	}

	async sendEvent(event) {
		const cfg = this.deps.getConfig();
		if (!cfg.enabled || !cfg.endpoint || !cfg.endpoint.startsWith('https://')) return false;
		if (Date.now() < this._nextAllowedAt) return false; // respect backoff

		let body;
		try {
			body = this._serialize(await this.buildPayload(event));
		} catch { return false; }
		if (!body) return false;

		const headers = { 'Content-Type': 'application/json' };
		if (cfg.pingSecret) headers['X-HPA-Ping-Secret'] = cfg.pingSecret;

		const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
		const timer = controller ? setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS) : null;
		await this._writeState({ lastTelemetryAttempt: new Date().toISOString(), lastTelemetryEvent: event });
		try {
			const res = await this._fetch(cfg.endpoint, {
				method: 'POST',
				headers,
				body,
				signal: controller ? controller.signal : undefined,
				// undici honours connect timeout via this option when present
				...(controller ? {} : {}),
			});
			if (timer) clearTimeout(timer);
			if (res.status === 204 || (res.status >= 200 && res.status < 300)) {
				this._failures = 0;
				this._nextAllowedAt = 0;
				await this._writeState({ lastTelemetrySuccess: new Date().toISOString() });
				this._log('info', `${event} ok (${res.status})`);
				return true;
			}
			this._backoff();
			this._log('info', `${event} rejected (${res.status})`);
			return false;
		} catch (e) {
			if (timer) clearTimeout(timer);
			this._backoff();
			this._log('info', `${event} failed: ${e && e.message ? e.message : 'error'}`);
			return false;
		}
	}

	_backoff() {
		const idx = Math.min(this._failures, BACKOFF_MS.length - 1);
		this._nextAllowedAt = Date.now() + BACKOFF_MS[idx];
		this._failures += 1;
	}

	/**
	 * Called once after a successful boot: sends `start`, and `update` if the
	 * running version changed since the last recorded boot.
	 */
	async onBoot() {
		const cfg = this.deps.getConfig();
		if (!cfg.enabled) return;
		const fields = this.deps.buildFields ? this.deps.buildFields() : {};
		const current = fields.otaVersion || fields.coreVersion || null;
		const st = await this._readState();
		const prev = st.lastKnownVersion || null;
		await this.sendEvent('start');
		if (prev && current && prev !== current) {
			await this.sendEvent('update');
		}
		if (current) await this._writeState({ lastKnownVersion: current });
	}

	async _maybeHeartbeat() {
		const cfg = this.deps.getConfig();
		if (!cfg.enabled) return;
		const st = await this._readState();
		const intervalMs = Math.max(1, cfg.intervalHours || 24) * 3600 * 1000;
		const last = st.lastTelemetrySuccess ? Date.parse(st.lastTelemetrySuccess) : 0;
		if (!last || Date.now() - last >= intervalMs) {
			await this.sendEvent('heartbeat');
		}
	}

	start() {
		if (this.timer) return;
		// Send `start` shortly after boot (fire-and-forget, never blocks).
		this.bootTimer = setTimeout(() => { this.onBoot().catch(() => undefined); }, 60_000);
		// Periodically consider a heartbeat (at most once per configured interval).
		this.timer = setInterval(() => { this._maybeHeartbeat().catch(() => undefined); }, HEARTBEAT_CHECK_MS);
	}

	stop() {
		if (this.timer) { clearInterval(this.timer); this.timer = null; }
		if (this.bootTimer) { clearTimeout(this.bootTimer); this.bootTimer = null; }
	}
}

module.exports = { CallHome, loadInstallId, isHex64, SCHEMA };
