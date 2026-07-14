'use strict';

const path = require('node:path');
const { ENV_PREFIX } = require('../pluginMeta');
const { isNewer, isAtLeast, isNewerWithBuild } = require('./semver');
const { fetchLatestRelease, fetchLatestPrerelease, findOtaAssets } = require('./github');
const { parseManifestJson } = require('./manifest');
const { installBundle } = require('./installer');
const { readState } = require('./state');

/**
 * Orchestrates OTA updates on two channels: `stable` and `experimental`.
 *
 * deps: {
 *   dataDir, coreVersion,
 *   getConfig: () => { mode, channel, checkIntervalHours },
 *   fetchImpl?, logger?, requestRestart?, publicKeyPem?
 * }
 */
class OtaManager {
	constructor(deps) {
		this.deps = deps;
		this.timer = null;
		this.latest = null; // { channel, manifest, htmlUrl, prerelease }
		this.lastCheckAt = null;
		this.lastError = null;
		this.installing = false;
	}

	_fetch(url, init) {
		const f = this.deps.fetchImpl
			|| ((u, i) => globalThis.fetch(u, i));
		return f(url, init);
	}

	_log(lvl, msg) {
		if (this.deps.logger) this.deps.logger(lvl, `[ota] ${msg}`);
	}

	getChannel() {
		const c = this.deps.getConfig ? this.deps.getConfig().channel : 'stable';
		return c === 'experimental' ? 'experimental' : 'stable';
	}

	getMode() {
		const m = this.deps.getConfig ? this.deps.getConfig().mode : 'manual';
		return m === 'auto' ? 'auto' : 'manual';
	}

	/** The version actually running now: OTA payload version or core image. */
	otaVersion() {
		return process.env[`${ENV_PREFIX}_OTA_VERSION`] || this.deps.coreVersion;
	}

	otaActive() {
		return process.env[`${ENV_PREFIX}_OTA_ACTIVE`] === '1';
	}

	async _fetchManifest(asset) {
		try {
			const res = await this._fetch(asset.url, {
				headers: { 'User-Agent': 'hcu-ota', Accept: 'application/json' },
			});
			if (!res.ok) return null;
			return parseManifestJson(await res.text());
		} catch {
			return null;
		}
	}

	async resolveRelease() {
		const channel = this.getChannel();
		const rel = channel === 'experimental'
			? await fetchLatestPrerelease(this._fetch.bind(this))
			: await fetchLatestRelease(this._fetch.bind(this));
		if (!rel) return null;
		const assets = findOtaAssets(rel);
		if (!assets.manifest) return null;
		const manifest = await this._fetchManifest(assets.manifest);
		if (!manifest) return null;
		return { channel, manifest, htmlUrl: rel.htmlUrl, prerelease: rel.prerelease };
	}

	_isUpdate(manifest) {
		const current = this.otaVersion();
		return this.getChannel() === 'experimental'
			? isNewerWithBuild(manifest.version, current)
			: isNewer(manifest.version, current);
	}

	async check() {
		this.lastCheckAt = new Date().toISOString();
		try {
			const resolved = await this.resolveRelease();
			this.latest = resolved;
			this.lastError = null;
			if (resolved && this.getMode() === 'auto' && this._isUpdate(resolved.manifest)
				&& !this._requiresCore(resolved.manifest)) {
				this._log('info', `auto-mode: installing ${resolved.manifest.version}`);
				await this.install();
			}
			return this.getStatus();
		} catch (e) {
			this.lastError = e && e.message ? e.message : 'check-failed';
			return this.getStatus();
		}
	}

	_requiresCore(manifest) {
		return !isAtLeast(this.deps.coreVersion, manifest.minCoreVersion);
	}

	async install() {
		if (this.installing) return { ok: false, error: 'busy' };
		if (!this.latest) {
			const r = await this.resolveRelease();
			this.latest = r;
		}
		if (!this.latest) return { ok: false, error: 'no-release' };
		const manifest = this.latest.manifest;
		if (!this._isUpdate(manifest)) return { ok: false, error: 'already-current' };
		if (this._requiresCore(manifest)) return { ok: false, error: 'requires-core' };

		this.installing = true;
		try {
			const res = await installBundle(manifest, {
				dataDir: this.deps.dataDir,
				fetchImpl: this._fetch.bind(this),
				publicKeyPem: this.deps.publicKeyPem,
				logger: this.deps.logger,
			});
			if (!res.ok) {
				this.lastError = res.error;
				return res;
			}
			this._log('info', `installed ${res.version}; requesting restart`);
			if (this.deps.requestRestart) {
				setTimeout(() => this.deps.requestRestart(), 500);
			}
			return res;
		} finally {
			this.installing = false;
		}
	}

	start() {
		if (this.timer) return;
		const hours = Math.max(1, this.deps.getConfig ? this.deps.getConfig().checkIntervalHours : 6);
		// First check shortly after boot, then periodically.
		setTimeout(() => { this.check().catch(() => undefined); }, 90_000);
		this.timer = setInterval(() => { this.check().catch(() => undefined); }, hours * 3_600_000);
	}

	stop() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	getStatus() {
		const state = readState(this.deps.dataDir);
		const latestManifest = this.latest ? this.latest.manifest : null;
		return {
			coreVersion: this.deps.coreVersion,
			otaVersion: this.otaVersion(),
			otaActive: this.otaActive(),
			activeVersion: state.activeVersion,
			channel: this.getChannel(),
			mode: this.getMode(),
			checkIntervalHours: this.deps.getConfig ? this.deps.getConfig().checkIntervalHours : null,
			latestVersion: latestManifest ? latestManifest.version : null,
			latestNotes: latestManifest ? (latestManifest.notes || null) : null,
			latestUrl: this.latest ? this.latest.htmlUrl : null,
			updateAvailable: latestManifest ? this._isUpdate(latestManifest) : false,
			requiresCore: latestManifest ? this._requiresCore(latestManifest) : false,
			minCoreVersion: latestManifest ? latestManifest.minCoreVersion : null,
			installing: this.installing,
			lastCheckAt: this.lastCheckAt,
			lastError: this.lastError,
			quarantined: state.quarantined,
		};
	}
}

module.exports = { OtaManager };
