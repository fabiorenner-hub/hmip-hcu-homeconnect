'use strict';

const path = require('path');

const { Logger } = require('./logger');
const { StateStore } = require('./state');
const { HcuClient } = require('./hcuClient');
const { HomeConnectAuth } = require('./homeconnect/auth');
const { HomeConnectApi } = require('./homeconnect/api');
const { HomeConnectEvents } = require('./homeconnect/events');
const { buildConfigTemplate, applyConfigUpdate } = require('./config');
const { buildDevices, controlRequestToAction, applianceUpdateToFeatures, APPLIANCES_WITH_PROGRAMS, APPLIANCES_WITH_ENERGY, typicalPowerForType } = require('./mapping');
const { DebugDashboard } = require('./dashboard');
const { SetupServer } = require('./setupServer');
const { OtaManager } = require('./ota/manager');
const { CallHome } = require('./analytics/callHome');
const { ENV_PREFIX } = require('./pluginMeta');

// Core (image) version. Kept in sync with package.json by the release process.
const CORE_VERSION = process.env[`${ENV_PREFIX}_VERSION`] || require('../package.json').version;

class Plugin {
	constructor({ pluginId, host, tokenFile }) {
		this.pluginId = pluginId;
		this.host = host;
		this.tokenFile = tokenFile;
		this.startedAt = Date.now();

		this.logger = new Logger({ bufferSize: 1000, level: 'info' });
		this.state = new StateStore({
			file: path.join(process.env.PLUGIN_STATE_DIR || './data', 'plugin-state.json'),
			logger: this.logger,
		});
		this.state.load();

		// One-shot reset
		if (this.state.config.resetSession) {
			this.logger.warn('resetSession=true: clearing stored Home Connect session');
			this.state.session = null;
			this.state.config = { ...this.state.config, resetSession: false };
		}
		if (this.state.config.verboseLogging) {
			this.logger.setLevel('debug');
		}

		this.auth = new HomeConnectAuth({
			logger: this.logger,
			state: this.state,
			onVerificationUrl: url => {
				this._announceVerificationUrl(url);
				this.setup.broadcastState();
			},
		});
		this.api = new HomeConnectApi({ auth: this.auth, state: this.state, logger: this.logger });
		this.events = new HomeConnectEvents({
			state: this.state,
			logger: this.logger,
			onEvent: evt => this._onHomeConnectEvent(evt),
		});

		this.hcu = new HcuClient({
			pluginId,
			host,
			tokenFile,
			logger: this.logger,
			handlers: {
				onConnected: () => this._onHcuConnected(),
				onDisconnected: () => { this.readiness = 'CONFIG_REQUIRED'; },
				onPluginStateRequest: msg => this.hcu.sendPluginReady(this.readiness, msg.id),
				onConfigTemplateRequest: msg => this._handleConfigTemplate(msg),
				onConfigUpdateRequest: msg => this._handleConfigUpdate(msg),
				onDiscoverRequest: msg => this._handleDiscover(msg),
				onControlRequest: msg => this._handleControl(msg),
				onExclusionEvent: msg => this._handleExclusion(msg),
			},
		});

		this.dashboard = new DebugDashboard({ logger: this.logger, plugin: this });
		this.setup = new SetupServer({ logger: this.logger, plugin: this });

		this.coreVersion = CORE_VERSION;

		// OTA updater (stable / experimental channels).
		this.ota = new OtaManager({
			dataDir: process.env.PLUGIN_STATE_DIR || './data',
			coreVersion: CORE_VERSION,
			getConfig: () => ({
				mode: this.state.config.updateMode,
				channel: this.state.config.updateChannel,
				checkIntervalHours: this.state.config.updateCheckIntervalHours,
			}),
			logger: (lvl, msg) => this.logger[lvl === 'warn' ? 'warn' : 'info'](msg),
			requestRestart: () => this._requestRestart(),
		});

		// Anonymous usage statistics (default on, opt-out via config).
		this.analytics = new CallHome({
			dataDir: process.env.PLUGIN_STATE_DIR || './data',
			getConfig: () => ({
				enabled: this.state.config.analyticsEnabled,
				endpoint: this.state.config.analyticsEndpoint || undefined,
				intervalHours: this.state.config.analyticsIntervalHours,
				pingSecret: this.state.config.analyticsPingSecret || undefined,
			}),
			buildFields: () => this._buildAnalyticsFields(),
			logger: (lvl, msg) => this.logger[lvl === 'warn' ? 'warn' : 'info'](msg),
		});

		// HCU device cache: deviceId -> hcuDevice
		this.hcuDevices = new Map();
		// Per-haId snapshot of latest settings/status as raw key/value maps
		this.applianceSettings = {};
		this.applianceStatus = {};
		this.appliancePrograms = {}; // haId -> { selected, available }
		this.eventStreamActive = false;
		this.readiness = 'CONFIG_REQUIRED';
		this.refreshTimer = null;
		this.pollTimer = null;
		this.energyTimer = null;
		this.energyLastTick = 0;
		this.energyHistory = {}; // haId -> [{ ts, watts, kwh }]
		this.energyHistoryMax = 120; // 60 minutes at 30s/tick
	}

	async start() {
		this.logger.info(`Starting plugin ${this.pluginId} â†’ HCU ${this.host}`);
		this._startDashboardIfEnabled();
		this._updateSetupServer();

		await this.hcu.start();

		// Try authenticating in the background; HCU connection may already be up.
		this._initHomeConnect().catch(e => this.logger.error('HC initialization failed:', e.message));

		// Background services: OTA update checks + opt-in analytics.
		this.ota.start();
		this.analytics.start();

		this._installSignalHandlers();

		// Tell the bootstrap loader we booted successfully (resets the
		// crash-loop counter / records lastGoodAt). No-op outside the loader.
		const markHealthy = globalThis.__otaMarkHealthy;
		if (typeof markHealthy === 'function') {
			try { markHealthy(); } catch { /* ignore */ }
		}
		this.logger.info(`Plugin ready (core ${this.coreVersion}${this.ota.otaActive() ? `, OTA ${this.ota.otaVersion()}` : ''})`);
	}

	_requestRestart() {
		this.logger.warn('OTA install complete — restarting to apply the new payload');
		setTimeout(() => process.exit(0), 500).unref();
	}

	/**
	 * Technical fields for the schema-1 analytics payload. Only pseudonymous
	 * version/platform metadata — NO PII, no SGTIN, no device data.
	 */
	_buildAnalyticsFields() {
		const otaVersion = this.ota.otaVersion();
		return {
			coreVersion: this.coreVersion,
			otaVersion,
			buildId: otaVersion, // includes the +exp build tail on experimental payloads
			arch: process.arch,
			hcuFirmware: this.hcuFirmware || undefined,
			lang: (this.state.config.language || 'de-DE').slice(0, 2),
		};
	}

	/**
	 * Setup wizard runs while the user is not authenticated. Once a valid
	 * Home Connect session is present, the wizard shuts down so its URL
	 * stops being reachable.
	 *
	 * Note: with the HCU's container sandbox the wizard port is generally
	 * NOT reachable from the LAN (container IP only). Users sign in via the
	 * Home Connect verification link rendered directly in the HCUweb config
	 * page. The wizard is kept around for advanced setups where the
	 * container port has been exposed to the LAN.
	 */
	_updateSetupServer() {
		const loggedIn = !!this.state.session?.access_token;
		if (loggedIn) {
			// Push the final "done" state to any open browser, then stop a
			// few seconds later so the page can render the success screen.
			this.setup.stopGracefully();
		} else {
			this.setup.start();
		}
	}

	_startDashboardIfEnabled() {
		if (this.state.config.debugDashboard) {
			try {
				this.dashboard.start(this.state.config.debugDashboardPort);
			} catch (e) {
				this.logger.error('Failed to start dashboard:', e.message);
			}
		}
	}

	_installSignalHandlers() {
		const stop = signal => {
			this.logger.info(`Received ${signal}, shutting down`);
			this.events.stop();
			this.hcu.stop();
			this.dashboard.stop();
			this.setup.stop();
			this.ota.stop();
			this.analytics.stop();
			if (this.refreshTimer) clearTimeout(this.refreshTimer);
			if (this.pollTimer) clearInterval(this.pollTimer);
			if (this.energyTimer) clearInterval(this.energyTimer);
			this.state.save();
			setTimeout(() => process.exit(0), 200).unref();
		};
		process.on('SIGINT', () => stop('SIGINT'));
		process.on('SIGTERM', () => stop('SIGTERM'));
	}

	async _initHomeConnect() {
		if (!this.state.config.clientId) {
			this.readiness = 'CONFIG_REQUIRED';
			this.logger.warn('No clientId configured. Plugin stays unconfigured until set.');
			return;
		}

		try {
			if (this.state.session?.refresh_token) {
				try {
					await this.auth.refresh();
				} catch (e) {
					this.logger.warn('Refresh failed, falling back to device flow:', e.message);
					this.state.session = null;
				}
			}

			if (!this.state.session?.access_token) {
				await this.auth.login();
			}

			this._scheduleTokenRefresh();
			await this._refreshAppliances();

			// The event stream is best-effort. A failure here (e.g. a broken
			// EventSource binding) must not invalidate a successful login â€”
			// devices were already discovered and the HCU should see READY.
			try {
				this.events.start();
				this.eventStreamActive = true;
			} catch (e) {
				this.eventStreamActive = false;
				this.logger.warn(`Event stream setup failed: ${e.message}. Falling back to polling only.`);
			}

			this.readiness = 'READY';
			if (this.hcu.connected) {
				this.hcu.sendPluginReady('READY');
				// Tell the user that everything worked. The user message hits
				// the Homematic IP smartphone app immediately, while the HCUweb
				// configuration page may still show the old verification link
				// until the user reloads it.
				this.hcu.sendUserMessage({
					messageCategory: 'INFO',
					userMessageId: 'hc-login-success',
					title: { en: 'Home Connect connected', de: 'Home Connect verbunden' },
					message: {
						en: `Sign-in successful. ${this.hcuDevices.size} device(s) are now available in Homematic IP.`,
						de: `Anmeldung erfolgreich. ${this.hcuDevices.size} Geräte sind jetzt in Homematic IP verfügbar.`,
					},
					behaviorType: 'DISMISSIBLE',
				});
				// Clean up any leftover "login required / failed" message.
				this.hcu.deleteUserMessage('hc-login-required');
				this.hcu.deleteUserMessage('hc-login-failed');
			}
			this._configurePolling();
			this._startEnergyTracker();
			// Broadcast the new "done" state to the wizard before we tell
			// the lifecycle to shut it down (stopGracefully also broadcasts).
			this.setup.broadcastState();
			this._updateSetupServer();
		} catch (e) {
			this.logger.error('Home Connect setup failed:', e.message);
			if (e.oauthError || e.oauthErrorDescription) {
				this.logger.error(`OAuth error: ${e.oauthError || ''} ${e.oauthErrorDescription || ''}`.trim());
			}
			this.state.lastVerificationStatus = {
				state: 'error',
				message: e.oauthErrorDescription || e.oauthError || e.message,
				at: new Date().toISOString(),
			};
			this.readiness = 'CONFIG_REQUIRED';
			if (this.hcu.connected) {
				this.hcu.sendPluginReady('CONFIG_REQUIRED');
				const detail = e.oauthErrorDescription || e.oauthError || e.message;
				this.hcu.sendUserMessage({
					messageCategory: 'ERROR',
					userMessageId: 'hc-login-failed',
					title: { en: 'Home Connect login failed', de: 'Home Connect Anmeldung fehlgeschlagen' },
					message: {
						en: `Home Connect rejected the login: ${detail}. Verify the Client ID and that the Device Flow is enabled in the Home Connect developer portal.`,
						de: `Home Connect hat die Anmeldung abgelehnt: ${detail}. Pruefe die Client ID und ob im Home Connect Entwicklerportal der "Device Flow" aktiviert ist.`,
					},
					behaviorType: 'DISMISSIBLE',
				});
			}
			this._updateSetupServer();
			this.setup.broadcastState();
		}
	}

	_scheduleTokenRefresh() {
		if (this.refreshTimer) clearTimeout(this.refreshTimer);
		const session = this.state.session;
		if (!session?.expires_in) return;
		const ms = Math.max(60, session.expires_in - 200) * 1000;
		this.refreshTimer = setTimeout(async () => {
			try {
				await this.auth.refresh();
				this.events.start(); // reconnect SSE with new token
			} catch (e) {
				this.logger.warn('Scheduled refresh failed:', e.message);
			}
			this._scheduleTokenRefresh();
		}, ms);
	}

	_configurePolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
		const sec = this.state.config.pollIntervalSec;
		if (sec && sec > 0) {
			const intervalMs = Math.max(60, sec) * 1000;
			this.pollTimer = setInterval(() => {
				this._refreshAppliances().catch(e => this.logger.warn('Polling failed:', e.message));
			}, intervalMs);
			this.logger.info(`Polling enabled every ${intervalMs / 1000}s`);
		}
	}

	/**
	 * Tick once per 30 seconds: integrate currentPower (W) into the kWh counter
	 * for every running appliance and emit a STATUS_EVENT with the new values.
	 */
	_startEnergyTracker() {
		if (this.energyTimer) clearInterval(this.energyTimer);
		if (!this.state.config.enableEnergy) return;
		this.energyLastTick = Date.now();
		this.energyTimer = setInterval(() => this._tickEnergy(), 30_000);
	}

	_tickEnergy() {
		const now = Date.now();
		const dtSec = Math.max(0, (now - this.energyLastTick) / 1000);
		this.energyLastTick = now;
		if (dtSec === 0) return;

		const ts = new Date(now).toISOString();
		for (const dev of this.hcuDevices.values()) {
			if (dev.role !== 'energy') continue;
			const powerFeat = dev.features.find(f => f.type === 'currentPower');
			const watts = powerFeat ? powerFeat.currentPower || 0 : 0;
			const counterFeat = dev.features.find(f => f.type === 'energyCounter');
			const prev = counterFeat ? counterFeat.energyCounter || 0 : 0;
			let next = prev;
			if (watts > 0) {
				const incrementKWh = (watts * dtSec) / 3600 / 1000;
				next = round3(prev + incrementKWh);
				const newFeatures = [
					{ type: 'currentPower', currentPower: watts },
					{ type: 'energyCounter', energyCounter: next },
				];
				dev.features = newFeatures;
				this.state.setEnergyCounter(dev.sourceHaId, next);
				this.hcu.sendStatusEvent(dev.deviceId, newFeatures);
			}
			// Always record a history sample for the chart
			const series = (this.energyHistory[dev.sourceHaId] = this.energyHistory[dev.sourceHaId] || []);
			series.push({ ts, watts, kwh: next });
			if (series.length > this.energyHistoryMax) series.shift();
		}
	}

	async _refreshAppliances() {
		const list = await this.api.getAppliances();
		this.logger.info(`Discovered ${list.length} Home Connect appliance(s)`);
		this.hcuDevices.clear();
		this.applianceSettings = {};
		this.applianceStatus = {};
		this.appliancePrograms = {};

		for (const app of list) {
			this.state.upsertAppliance(app.haId, {
				type: app.type,
				name: app.name,
				brand: app.brand,
				vib: app.vib,
				enumber: app.enumber,
				connected: app.connected,
			});

			let settings = [];
			let status = [];
			if (app.connected) {
				settings = await this.api.getSettings(app.haId);
				status = await this.api.getStatus(app.haId);
				if (this.state.config.enablePrograms && APPLIANCES_WITH_PROGRAMS.has(app.type)) {
					const [selected, available] = await Promise.all([
						this.api.getSelectedProgram(app.haId),
						this.api.getAvailablePrograms(app.haId),
					]);
					this.appliancePrograms[app.haId] = {
						selected: selected?.key || null,
						available: available.map(p => p.key),
					};
				}
			}
			this.applianceSettings[app.haId] = settings;
			this.applianceStatus[app.haId] = status;

			const devs = buildDevices(app, settings, status, {
				...this.state.config,
				_energyCounters: this.state.data.energyCounters,
			});
			for (const d of devs) {
				this.hcuDevices.set(d.deviceId, d);
			}
		}

		// Re-announce discovery (HCU stores it once on DISCOVER_REQUEST, so we just keep it for next time).
		this.logger.info(`Mapped to ${this.hcuDevices.size} HCU device(s)`);
	}

	_onHcuConnected() {
		this.readiness = this.state.session?.access_token ? 'READY' : 'CONFIG_REQUIRED';
		this.hcu.sendPluginReady(this.readiness);
	}

	_announceVerificationUrl(url) {
		if (this.hcu.connected) {
			this.hcu.sendUserMessage({
				messageCategory: 'WARN',
				userMessageId: 'hc-login-required',
				title: { en: 'Home Connect login required', de: 'Home Connect Anmeldung erforderlich' },
				message: {
					en: `Open this URL: ${url}`,
					de: `Bitte folgende URL Ã¶ffnen: ${url}`,
				},
				behaviorType: 'DISMISSIBLE',
			});
		}
	}

	_handleConfigTemplate(msg) {
		const languageCode = msg?.body?.languageCode;
		const body = buildConfigTemplate(this.state, languageCode);
		this.hcu.sendConfigTemplate(msg.id, body);
	}

	async _handleConfigUpdate(msg) {
		const props = msg?.body?.properties || {};
		const languageCode = msg?.body?.languageCode;
		this.logger.info('Config update received:', Object.keys(props).join(', '));

		const oldClientId = this.state.config.clientId;
		const oldDashboard = this.state.config.debugDashboard;
		const oldDashboardPort = this.state.config.debugDashboardPort;
		const oldVerbose = this.state.config.verboseLogging;
		const oldPoll = this.state.config.pollIntervalSec;

		const { config, changed } = applyConfigUpdate(this.state, props);
		this.logger.info('Config changed keys:', changed.join(', ') || '(none)');
		this.state.save();

		if (config.verboseLogging !== oldVerbose) {
			this.logger.setLevel(config.verboseLogging ? 'debug' : 'info');
		}

		if (config.resetSession) {
			this.logger.warn('User requested session reset');
			this.state.session = null;
			this.state.config = { ...config, resetSession: false };
		}

		if (config.debugDashboard !== oldDashboard || config.debugDashboardPort !== oldDashboardPort) {
			if (config.debugDashboard) {
				this.dashboard.start(config.debugDashboardPort);
			} else {
				this.dashboard.stop();
			}
		}

		if (config.pollIntervalSec !== oldPoll) {
			this._configurePolling();
		}

		if (config.enableEnergy !== this.state.config.enableEnergy || changed.includes('enableEnergy')) {
			this._startEnergyTracker();
		}

		if (changed.includes('updateMode') || changed.includes('updateChannel') || changed.includes('updateCheckIntervalHours')) {
			this.ota.stop();
			this.ota.start();
		}

		if (changed.includes('analyticsEnabled') || changed.includes('analyticsEndpoint') || changed.includes('analyticsIntervalHours')) {
			this.analytics.stop();
			this.analytics.start();
		}

		const needsLogin = config.clientId !== oldClientId || config.resetSession;
		if (needsLogin) {
			// Kick off the device flow, then briefly wait for the verification
			// URL so we can include it in the CONFIG_UPDATE_RESPONSE message â€”
			// HCUweb renders that text in the post-save dialog. After the user
			// clicks Save in HCUweb the page typically reloads anyway, so the
			// new template (with the WEBLINK + QRCODE) is shown right after.
			this._initHomeConnect().catch(e => this.logger.error('Re-init failed:', e.message));
			const url = await this._waitForVerificationUrl(8000);
			if (url) {
				this.hcu.sendConfigUpdateResponse(msg.id, 'APPLIED', {
					en: `Open this link in any browser to finish the Home Connect login: ${url}`,
					de: `Anmeldung bei Home Connect: bitte folgenden Link in einem Browser Ã¶ffnen und bestÃ¤tigen: ${url}`,
				}, languageCode);
				return;
			}
			const status = this.state.lastVerificationStatus;
			if (status?.state === 'error') {
				this.hcu.sendConfigUpdateResponse(msg.id, 'FAILED', {
					en: `Home Connect login failed: ${status.message}`,
					de: `Home Connect Anmeldung fehlgeschlagen: ${status.message}`,
				}, languageCode);
				return;
			}
			this.hcu.sendConfigUpdateResponse(msg.id, 'APPLIED', {
				en: 'Configuration saved. Reload the plugin configuration page to see the Home Connect login link.',
				de: 'Konfiguration gespeichert. Lade die Plugin-Konfigurationsseite neu, um den Home Connect Anmeldelink zu sehen.',
			}, languageCode);
			return;
		}

		this.hcu.sendConfigUpdateResponse(msg.id, 'APPLIED', {
			en: 'Configuration applied.',
			de: 'Konfiguration Ã¼bernommen.',
		}, languageCode);
	}

	/**
	 * Wait up to `timeoutMs` for either `state.lastVerificationUrl` or a
	 * non-pending lastVerificationStatus. Returns the URL or null on timeout.
	 */
	async _waitForVerificationUrl(timeoutMs) {
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			if (this.state.session?.access_token) return null; // already logged in
			if (this.state.lastVerificationUrl) return this.state.lastVerificationUrl;
			if (this.state.lastVerificationStatus?.state === 'error') return null;
			await new Promise(r => setTimeout(r, 200));
		}
		return null;
	}

	_handleDiscover(msg) {
		const devices = Array.from(this.hcuDevices.values()).map(d => ({
			deviceType: d.deviceType,
			deviceId: d.deviceId,
			firmwareVersion: d.firmwareVersion,
			friendlyName: d.friendlyName,
			modelType: d.modelType,
			features: d.features,
		}));
		this.hcu.sendDiscoverResponse(msg.id, devices);
	}

	/**
	 * The HCU sends EXCLUSION_EVENT when the user removes one of our devices
	 * from the HCU device list. Drop the device from our local cache so we
	 * stop emitting STATUS_EVENTs for it.
	 */
	_handleExclusion(msg) {
		const ids = msg?.body?.deviceIds || [];
		for (const id of ids) {
			if (this.hcuDevices.has(id)) {
				this.hcuDevices.delete(id);
			}
		}
	}

	async _handleControl(msg) {
		const deviceId = msg?.body?.deviceId;
		const dev = this.hcuDevices.get(deviceId);
		if (!dev) {
			this.logger.warn(`CONTROL_REQUEST for unknown device ${deviceId}`);
			this.hcu.sendControlResponse(msg.id, deviceId, false, { code: 'UNKNOWN_DEVICE', message: 'No such device' });
			return;
		}
		const action = controlRequestToAction(dev, msg.body);
		if (action.kind === 'unsupported') {
			this.hcu.sendControlResponse(msg.id, deviceId, false, { code: 'UNSUPPORTED', message: action.reason });
			return;
		}
		try {
			if (action.kind === 'setSetting') {
				await this.api.putSetting(action.haId, action.key, action.value);
				// Optimistic local feature update + STATUS_EVENT echo
				const newFeatures = msg.body.features;
				dev.features = newFeatures;
				this.hcu.sendControlResponse(msg.id, deviceId, true);
				this.hcu.sendStatusEvent(deviceId, newFeatures);
				return;
			}
			if (action.kind === 'startProgram') {
				const selected = await this.api.getSelectedProgram(action.haId);
				if (!selected?.key) {
					this.hcu.sendControlResponse(msg.id, deviceId, false, {
						code: 'NO_PROGRAM_SELECTED',
						message: 'WÃ¤hle zuerst auf dem GerÃ¤t ein Programm aus.',
					});
					return;
				}
				const options = (selected.options || []).map(o => ({ key: o.key, value: o.value }));
				try {
					await this.api.putActiveProgram(action.haId, selected.key, options);
				} catch (e) {
					this.logger.warn('Start with options failed, retrying without options:', e.message);
					await this.api.putActiveProgram(action.haId, selected.key, []);
				}
				dev.features = msg.body.features;
				this.hcu.sendControlResponse(msg.id, deviceId, true);
				this.hcu.sendStatusEvent(deviceId, msg.body.features);
				return;
			}
			if (action.kind === 'stopProgram') {
				await this.api.stopProgram(action.haId);
				dev.features = msg.body.features;
				this.hcu.sendControlResponse(msg.id, deviceId, true);
				this.hcu.sendStatusEvent(deviceId, msg.body.features);
				return;
			}
			this.hcu.sendControlResponse(msg.id, deviceId, false, { code: 'UNSUPPORTED', message: 'Unknown action kind' });
		} catch (e) {
			this.logger.error('Control failed:', e.message);
			this.hcu.sendControlResponse(msg.id, deviceId, false, {
				code: 'API_ERROR',
				message: e?.response?.data?.error?.description || e.message,
			});
		}
	}

	_onHomeConnectEvent(evt) {
		if (evt.type === 'AUTH_FAILED') {
			this.logger.warn('Event stream auth failed, refreshing token');
			this.auth.refresh()
				.then(() => this.events.start())
				.catch(e => this.logger.error('Token refresh after AUTH_FAILED failed:', e.message));
			return;
		}

		if (evt.type === 'CONNECTED' || evt.type === 'PAIRED') {
			this.state.upsertAppliance(evt.haId, { connected: true });
			// best-effort: refresh that appliance
			this._refreshSingleAppliance(evt.haId).catch(e => this.logger.debug('Refresh single failed:', e.message));
			return;
		}
		if (evt.type === 'DISCONNECTED' || evt.type === 'DEPAIRED') {
			this.state.upsertAppliance(evt.haId, { connected: false });
			return;
		}

		if (evt.type === 'STATUS' || evt.type === 'NOTIFY' || evt.type === 'EVENT') {
			const haId = evt.haId;
			const items = evt.payload?.items || [];
			// Update local snapshot
			const settingsMap = new Map((this.applianceSettings[haId] || []).map(s => [s.key, s.value]));
			const statusMap = new Map((this.applianceStatus[haId] || []).map(s => [s.key, s.value]));
			for (const it of items) {
				if (settingsMap.has(it.key)) settingsMap.set(it.key, it.value);
				else statusMap.set(it.key, it.value);
			}
			this.applianceSettings[haId] = Array.from(settingsMap, ([k, v]) => ({ key: k, value: v }));
			this.applianceStatus[haId] = Array.from(statusMap, ([k, v]) => ({ key: k, value: v }));

			// Notify HCU
			const matches = Array.from(this.hcuDevices.values()).filter(d => d.sourceHaId === haId);
			const updates = applianceUpdateToFeatures(matches, items);
			for (const u of updates) {
				const dev = this.hcuDevices.get(u.deviceId);
				if (dev) dev.features = u.features;
				this.hcu.sendStatusEvent(u.deviceId, u.features);
			}
		}
	}

	async _refreshSingleAppliance(haId) {
		const settings = await this.api.getSettings(haId);
		const status = await this.api.getStatus(haId);
		this.applianceSettings[haId] = settings;
		this.applianceStatus[haId] = status;
		const appliance = {
			haId,
			...(this.state.data.discoveredAppliances[haId] || {}),
		};
		const devs = buildDevices(appliance, settings, status, {
			...this.state.config,
			_energyCounters: this.state.data.energyCounters,
		});
		for (const d of devs) {
			const old = this.hcuDevices.get(d.deviceId);
			this.hcuDevices.set(d.deviceId, d);
			if (!old || JSON.stringify(old.features) !== JSON.stringify(d.features)) {
				this.hcu.sendStatusEvent(d.deviceId, d.features);
			}
		}
	}

	getDashboardSnapshot() {
		const settingsByHaId = {};
		for (const [haId, list] of Object.entries(this.applianceSettings)) {
			const map = {};
			for (const s of list) map[s.key] = s.value;
			settingsByHaId[haId] = map;
		}
		const statusByHaId = {};
		for (const [haId, list] of Object.entries(this.applianceStatus)) {
			const map = {};
			for (const s of list) map[s.key] = s.value;
			statusByHaId[haId] = map;
		}
		const appliances = {};
		for (const [haId, info] of Object.entries(this.state.data.discoveredAppliances)) {
			appliances[haId] = {
				...info,
				settings: settingsByHaId[haId] || {},
				status: statusByHaId[haId] || {},
				programs: this.appliancePrograms[haId] || null,
			};
		}
		return {
			pluginId: this.pluginId,
			host: this.host,
			readiness: this.readiness,
			uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
			hcuConnected: this.hcu.connected,
			hcuStats: this.hcu.stats,
			hcAuthenticated: !!this.state.session?.access_token,
			eventStream: this.eventStreamActive,
			eventStats: this.events.getStats(),
			session: this.state.session,
			lastVerificationUrl: this.state.lastVerificationUrl,
			config: this.state.config,
			appliances,
			hcuDevices: Array.from(this.hcuDevices.values()),
			rateLimit: this.api.getStats(),
			energyHistory: this.energyHistory,
			energyCounters: this.state.data.energyCounters,
			coreVersion: this.coreVersion,
			ota: this.ota.getStatus(),
		};
	}

	async runAction(action, args = {}) {
		switch (action) {
			case 'otaStatus': {
				return { ok: true, status: this.ota.getStatus() };
			}
			case 'otaCheck': {
				const status = await this.ota.check();
				return { ok: true, status };
			}
			case 'otaInstall': {
				const res = await this.ota.install();
				return { ...res, status: this.ota.getStatus() };
			}
			case 'setUpdateConfig': {
				const patch = {};
				if (args.channel !== undefined) {
					if (args.channel !== 'stable' && args.channel !== 'experimental') {
						return { ok: false, error: 'channel must be stable or experimental' };
					}
					patch.updateChannel = args.channel;
				}
				if (args.mode !== undefined) {
					if (args.mode !== 'manual' && args.mode !== 'auto') {
						return { ok: false, error: 'mode must be manual or auto' };
					}
					patch.updateMode = args.mode;
				}
				if (args.checkIntervalHours !== undefined) {
					const h = parseInt(args.checkIntervalHours, 10);
					if (!Number.isFinite(h) || h < 1 || h > 168) {
						return { ok: false, error: 'checkIntervalHours must be 1..168' };
					}
					patch.updateCheckIntervalHours = h;
				}
				if (Object.keys(patch).length === 0) return { ok: false, error: 'nothing to change' };
				this.state.config = { ...this.state.config, ...patch };
				this.state.save();
				// Re-arm the OTA scheduler with the new channel/mode/interval.
				this.ota.stop();
				this.ota.start();
				return { ok: true, status: this.ota.getStatus() };
			}
			case 'analyticsPreview': {
				return { ok: true, payload: await this.analytics.preview() };
			}
			case 'refreshToken': {
				await this.auth.refresh();
				return { ok: true };
			}
			case 'refreshAppliances': {
				await this._refreshAppliances();
				return { ok: true, count: this.hcuDevices.size };
			}
			case 'restartEventStream': {
				this.events.start();
				return { ok: true };
			}
			case 'resetSession': {
				this.state.session = null;
				this.state.config = { ...this.state.config, resetSession: false };
				this.events.stop();
				this._initHomeConnect().catch(() => {});
				return { ok: true };
			}
			case 'sendTestUserMessage': {
				this.hcu.sendUserMessage({
					messageCategory: 'INFO',
					userMessageId: `dbg-${Date.now()}`,
					title: { en: 'Plugin test message', de: 'Plugin Testnachricht' },
					message: { en: 'Hello from the debug dashboard.', de: 'Hallo vom Debug-Dashboard.' },
					behaviorType: 'DISMISSIBLE',
				});
				return { ok: true };
			}
			case 'startProgram': {
				if (!args.haId) return { ok: false, error: 'haId required' };
				const sel = await this.api.getSelectedProgram(args.haId);
				if (!sel?.key) return { ok: false, error: 'No program selected on appliance' };
				const options = (sel.options || []).map(o => ({ key: o.key, value: o.value }));
				try {
					await this.api.putActiveProgram(args.haId, sel.key, options);
				} catch {
					await this.api.putActiveProgram(args.haId, sel.key, []);
				}
				return { ok: true, key: sel.key };
			}
			case 'stopProgram': {
				if (!args.haId) return { ok: false, error: 'haId required' };
				await this.api.stopProgram(args.haId);
				return { ok: true };
			}
			case 'setSetting': {
				if (!args.haId || !args.key) return { ok: false, error: 'haId and key required' };
				await this.api.putSetting(args.haId, args.key, args.value);
				return { ok: true };
			}
			case 'openDoor': {
				if (!args.haId) return { ok: false, error: 'haId required' };
				// Door open is a Command, not a Setting
				await this.api.raw('PUT', `/api/homeappliances/${args.haId}/commands/BSH.Common.Command.OpenDoor`, {
					data: { key: 'BSH.Common.Command.OpenDoor', value: true },
				});
				return { ok: true };
			}
			case 'resetEnergyCounter': {
				if (!args.haId) return { ok: false, error: 'haId required' };
				this.state.setEnergyCounter(args.haId, 0);
				const dev = Array.from(this.hcuDevices.values()).find(d => d.role === 'energy' && d.sourceHaId === args.haId);
				if (dev) {
					const watts = dev.features.find(f => f.type === 'currentPower')?.currentPower || 0;
					dev.features = [
						{ type: 'currentPower', currentPower: watts },
						{ type: 'energyCounter', energyCounter: 0 },
					];
					this.hcu.sendStatusEvent(dev.deviceId, dev.features);
				}
				delete this.energyHistory[args.haId];
				return { ok: true };
			}
			default:
				return { ok: false, error: `unknown action ${action}` };
		}
	}
}

function parseArgs() {
	const args = process.argv.slice(2);
	const pluginId = args[0] || process.env.PLUGIN_ID || 'de.kiro.plugin.homeconnect';
	const host = args[1] || process.env.HCU_HOST || 'host.containers.internal';
	const tokenFile = args[2] || process.env.AUTH_TOKEN_FILE || '/TOKEN';
	return { pluginId, host, tokenFile };
}

function round3(n) {
	return Math.round(n * 1000) / 1000;
}

/**
 * Entry point called by the bootstrap loader (dist/bootstrap/loader.js).
 * Boots the plugin and — on success — pings the loader's __otaMarkHealthy
 * hook (done inside Plugin.start()).
 */
async function main() {
	const { pluginId, host, tokenFile } = parseArgs();
	const plugin = new Plugin({ pluginId, host, tokenFile });
	await plugin.start();
	return plugin;
}

// Global robustness (Steering): never let an unhandled async error crash the
// process during setup — that would abort the HCU installation.
process.on('unhandledRejection', reason => {
	// eslint-disable-next-line no-console
	console.error('[unhandledRejection]', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', err => {
	// eslint-disable-next-line no-console
	console.error('[uncaughtException]', err && err.stack ? err.stack : err);
});

// Allow running directly (dev / legacy) as well as via the loader.
if (require.main === module) {
	main().catch(e => {
		// eslint-disable-next-line no-console
		console.error('Fatal error during start:', e);
		process.exit(1);
	});
}

module.exports = { Plugin, main };

