'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Persisted plugin state. Stored next to the plugin container's working dir
 * so the OAuth refresh token survives restarts.
 */

const DEFAULT_CONFIG = {
	clientId: '',
	language: 'de-DE',
	pollIntervalSec: 0,
	debugDashboard: false,
	debugDashboardPort: 8123,
	enableLight: true,
	enableSwitch: true,
	enableClimate: true,
	enablePrograms: true,
	enableEnergy: true,
	resetSession: false,
	verboseLogging: false,
};

class StateStore {
	constructor({ file, logger }) {
		this.file = file;
		this.logger = logger;
		this.data = {
			config: { ...DEFAULT_CONFIG },
			session: null, // { access_token, refresh_token, expires_in, next }
			lastVerificationUrl: null,
			discoveredAppliances: {}, // haId -> { type, name, enumber, vib, brand, connected }
			energyCounters: {}, // haId -> kWh accumulated
		};
		this._dirty = false;
		this._saveTimer = null;
	}

	load() {
		try {
			if (fs.existsSync(this.file)) {
				const raw = fs.readFileSync(this.file, 'utf8');
				const parsed = JSON.parse(raw);
				this.data.config = { ...DEFAULT_CONFIG, ...(parsed.config || {}) };
				this.data.session = parsed.session || null;
				this.data.discoveredAppliances = parsed.discoveredAppliances || {};
				this.data.energyCounters = parsed.energyCounters || {};
				this.logger.info('State loaded from', this.file);
			} else {
				this.logger.info('No state file found, using defaults');
			}
		} catch (e) {
			this.logger.error('Failed to load state:', e);
		}
	}

	save() {
		try {
			const dir = path.dirname(this.file);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
		} catch (e) {
			this.logger.error('Failed to save state:', e);
		}
	}

	scheduleSave(delay = 500) {
		if (this._saveTimer) {
			return;
		}
		this._saveTimer = setTimeout(() => {
			this._saveTimer = null;
			this.save();
		}, delay);
	}

	get config() { return this.data.config; }
	set config(value) { this.data.config = { ...DEFAULT_CONFIG, ...value }; this.scheduleSave(); }

	get session() { return this.data.session; }
	set session(value) { this.data.session = value; this.scheduleSave(); }

	get lastVerificationUrl() { return this.data.lastVerificationUrl; }
	set lastVerificationUrl(value) { this.data.lastVerificationUrl = value; }

	upsertAppliance(haId, info) {
		this.data.discoveredAppliances[haId] = { ...this.data.discoveredAppliances[haId], ...info };
		this.scheduleSave();
	}

	getEnergyCounter(haId) {
		return this.data.energyCounters[haId] || 0;
	}

	setEnergyCounter(haId, kWh) {
		this.data.energyCounters[haId] = kWh;
		this.scheduleSave(2000);
	}
}

module.exports = { StateStore, DEFAULT_CONFIG };
