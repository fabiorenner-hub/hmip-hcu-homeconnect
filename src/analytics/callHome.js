'use strict';

const fs = require('node:fs').promises;
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PLUGIN_ID } = require('../pluginMeta');

/**
 * Opt-in, anonymous call-home analytics.
 *
 * Privacy guardrails (family ethos, LOCAL/no-telemetry by default):
 * - Default OFF. Only sends when config.enabled === true AND a https endpoint
 *   is configured.
 * - No PII, no tokens, no coordinates/addresses, no device names.
 * - A random, persistent, anonymous installId (UUID under /data/analytics-id).
 * - Only aggregated, non-identifying fields.
 * - HTTPS-only, best-effort, fail-silent, never blocks.
 */

async function loadInstallId(dataDir) {
	const p = path.join(dataDir, 'analytics-id');
	try {
		const v = (await fs.readFile(p, 'utf8')).trim();
		if (v.length >= 8) return v;
	} catch { /* create below */ }
	const id = randomUUID();
	try {
		await fs.mkdir(dataDir, { recursive: true });
		await fs.writeFile(p, `${id}\n`, 'utf8');
	} catch { /* ignore */ }
	return id;
}

class CallHome {
	constructor(deps) {
		this.deps = deps;
		this.timer = null;
		this.idPromise = null;
		this.bootTimer = null;
	}

	_fetch(url, init) {
		const f = this.deps.fetchImpl || ((u, i) => globalThis.fetch(u, i));
		return f(url, init);
	}

	/** Exactly the payload the UI also shows (transparency). */
	async preview() {
		if (!this.idPromise) this.idPromise = loadInstallId(this.deps.dataDir);
		const installId = await this.idPromise;
		return {
			installId,
			pluginId: PLUGIN_ID,
			ts: new Date().toISOString(),
			...this.deps.buildPayload(),
		};
	}

	async _send() {
		const cfg = this.deps.getConfig();
		if (!cfg.enabled || !cfg.endpoint || !cfg.endpoint.startsWith('https://')) return;
		try {
			const body = JSON.stringify(await this.preview());
			const res = await this._fetch(cfg.endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
			});
			if (this.deps.logger) this.deps.logger('info', `analytics ping ${res.status}`);
		} catch { /* fail-silent */ }
	}

	start() {
		if (this.timer) return;
		const h = Math.max(1, this.deps.getConfig().intervalHours);
		this.bootTimer = setTimeout(() => { this._send().catch(() => undefined); }, 60_000);
		this.timer = setInterval(() => { this._send().catch(() => undefined); }, h * 3_600_000);
	}

	stop() {
		if (this.timer) { clearInterval(this.timer); this.timer = null; }
		if (this.bootTimer) { clearTimeout(this.bootTimer); this.bootTimer = null; }
	}
}

module.exports = { CallHome, loadInstallId };
