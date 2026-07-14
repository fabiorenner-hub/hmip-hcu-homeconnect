'use strict';

const { DEFAULT_CONFIG } = require('./state');

/**
 * Builds the body for CONFIG_TEMPLATE_RESPONSE in the language requested by
 * the HCU (per Connect API spec §6.4.1, the request carries `languageCode`).
 *
 * UX goals:
 * - Single primary action while logged out: paste Client ID, save.
 * - While the device flow is in flight: show one big WEBLINK ("Sign in")
 *   pointing directly at api.home-connect.com — works from any browser.
 * - After login: show only what is meaningful (status, restart-login).
 * - Device toggles + diagnostics live in a separate "Advanced" group
 *   collapsed away from the main flow.
 */

const I18N = {
	de: {
		groupAuth: 'Anmeldung',
		groupAuthDesc: 'Verbindung zu deinem Home Connect Konto.',
		groupDevices: 'Geräte',
		groupDevicesDesc: 'Welche Funktionen sollen als HCU-Geräte erscheinen?',
		groupAdvanced: 'Erweitert',
		groupAdvancedDesc: 'Sprache, Polling, Diagnose. Standardwerte sind in der Regel ausreichend.',

		clientIdName: 'Client ID',
		clientIdDesc: 'Aus deiner Home Connect Application unter developer.home-connect.com. Der OAuth Flow muss "Device Flow" sein. 64 Zeichen Hex (A-F, 0-9).',
		statusName: 'Status',
		statusDesc: 'Aktueller Anmeldestatus.',
		linkName: 'Anmeldelink',
		linkDesc: 'Diesen Link öffnen, mit dem im Developer-Portal hinterlegten Home Connect Account anmelden und "Allow" bestätigen. Funktioniert aus jedem Browser, auch vom Handy.',
		qrName: 'QR-Code',
		qrDesc: 'Mit der Handykamera scannen, um den Anmeldelink im Smartphone-Browser zu öffnen.',
		setupUrlName: 'Setup-Assistent',
		setupUrlDesc: 'Schritt-für-Schritt-UI zur Anmeldung. Diese URL im Browser öffnen — <deine-HCU-IP> durch die IP/den Hostnamen der HCU ersetzen, mit dem du auch HCUweb erreichst.',
		resetName: 'Anmeldung zurücksetzen',
		resetDesc: 'Beim Speichern wird der gespeicherte Login verworfen. Es kann anschliessend ein neuer Anmeldelink erzeugt werden.',

		switchName: 'Ein/Aus-Schalter',
		switchDesc: 'Erstellt pro Gerät einen Schalter (Power on/off).',
		lightName: 'Innen-/Ambientelicht',
		lightDesc: 'Licht-Gerät für Geräte mit steuerbarem Innenlicht (Dunstabzug, Backofen, Kühlschrank).',
		climateName: 'Kühltemperatur',
		climateDesc: 'Klimasensor mit der eingestellten Kühl-/Gefriertemperatur.',
		programsName: 'Programmsteuerung',
		programsDesc: 'Pro Gerät ein zusätzlicher Schalter: ON startet das aktuell gewählte Programm, OFF bricht es ab.',
		energyName: 'Energiezähler (geschätzt)',
		energyDesc: 'Geschätzter Verbrauch pro Gerät. Da Home Connect keine Live-Leistungsdaten liefert, wird ein typischer Verbrauch verwendet, solange ein Programm läuft.',

		languageName: 'Sprache (Programmnamen)',
		languageDesc: 'Sprache, in der Home Connect Programmnamen und Optionen ausliefert.',
		pollName: 'Polling-Intervall (Sekunden)',
		pollDesc: 'Optional zusätzlich zum Live-Event-Stream. 0 = aus.',
		dashName: 'Diagnose-Dashboard',
		dashDesc: 'Stellt unter Port <Port> ein Web-UI mit Logs, Geräten und Live-Status bereit (nur lokal im Container, sofern der Port nicht ans LAN durchgereicht ist).',
		dashPortName: 'Diagnose-Dashboard Port',
		dashPortDesc: 'TCP-Port (1024-65535).',
		verboseName: 'Ausführliches Logging',
		verboseDesc: 'Loggt jeden API-Call und jeden HCU-Frame. Nur zum Debuggen.',

		updChannelName: 'Update-Kanal',
		updChannelDesc: 'stable = geprüfte Releases. experimental = Vorabversionen (Over-the-Air, ohne neues HCU-Image). Für Tester.',
		updModeName: 'Update-Modus',
		updModeDesc: 'manual = nur auf Knopfdruck. auto = neue Version im gewählten Kanal automatisch installieren.',
		updIntervalName: 'Update-Prüfintervall (Stunden)',
		updIntervalDesc: 'Wie oft im Hintergrund nach neuen Versionen gesucht wird.',
		anEnabledName: 'Anonyme Nutzungsstatistik senden',
		anEnabledDesc: 'Opt-in. Sendet anonyme, aggregierte Zähler (Anzahl Geräte, Version, Kanal) an den unten konfigurierten Endpoint. KEINE Namen, Tokens, Orte oder Geräte-IDs. Standard: aus.',
		anEndpointName: 'Analytics-Endpoint (https)',
		anEndpointDesc: 'Eigener HTTPS-Endpoint, an den die Statistik gesendet wird. Leer = es wird nichts gesendet.',
		anIntervalName: 'Analytics-Intervall (Stunden)',
		anIntervalDesc: 'Wie oft die anonyme Statistik gesendet wird.',

		statusLoggedIn: '✓ Mit Home Connect verbunden.',
		statusLoggedInWithTime: ts => `✓ Mit Home Connect verbunden (${ts}).`,
		statusPending: '⏳ Warte auf Bestätigung. Klicke unten auf den Anmeldelink.',
		statusError: msg => `✕ Anmeldung fehlgeschlagen: ${msg}`,
		statusReady: 'Speichere die Konfiguration, um die Anmeldung zu starten.',
		statusEnterClientId: 'Trage deine Client ID ein und speichere.',
	},
	en: {
		groupAuth: 'Login',
		groupAuthDesc: 'Connection to your Home Connect account.',
		groupDevices: 'Devices',
		groupDevicesDesc: 'Which features should appear as HCU devices?',
		groupAdvanced: 'Advanced',
		groupAdvancedDesc: 'Language, polling, diagnostics. Defaults are usually fine.',

		clientIdName: 'Client ID',
		clientIdDesc: 'From your Home Connect Application at developer.home-connect.com. OAuth flow must be "Device Flow". 64 hex characters (A-F, 0-9).',
		statusName: 'Status',
		statusDesc: 'Current login status.',
		linkName: 'Login link',
		linkDesc: 'Open this link, sign in with the Home Connect account configured in the developer portal and click "Allow". Works from any browser, including your phone.',
		qrName: 'QR code',
		qrDesc: 'Scan with your phone camera to open the login link in your mobile browser.',
		setupUrlName: 'Setup wizard',
		setupUrlDesc: 'Step-by-step sign-in UI. Open this URL in your browser — replace <your-hcu-address> with the IP / hostname you use to reach HCUweb.',
		resetName: 'Reset login',
		resetDesc: 'On save, the stored login is discarded. A fresh login link can then be generated.',

		switchName: 'On/off switch',
		switchDesc: 'Adds a switch (power on/off) per appliance.',
		lightName: 'Cavity / ambient light',
		lightDesc: 'Light device for appliances with a controllable internal light (hood, oven, fridge).',
		climateName: 'Cooling temperature',
		climateDesc: 'Climate sensor exposing the configured fridge / freezer setpoint.',
		programsName: 'Program control',
		programsDesc: 'Per appliance, a switch: ON starts the currently selected program, OFF aborts it.',
		energyName: 'Energy meter (estimated)',
		energyDesc: 'Estimated consumption per appliance. Home Connect does not expose live wattage, so a typical-power table is used while a program is running.',

		languageName: 'Language (program names)',
		languageDesc: 'Language Home Connect uses for program names and options.',
		pollName: 'Polling interval (seconds)',
		pollDesc: 'Optional, in addition to the live event stream. 0 = off.',
		dashName: 'Diagnostic dashboard',
		dashDesc: 'Serves a web UI with logs, devices and live state on the configured port (only inside the container unless the port is forwarded to the LAN).',
		dashPortName: 'Diagnostic dashboard port',
		dashPortDesc: 'TCP port (1024-65535).',
		verboseName: 'Verbose logging',
		verboseDesc: 'Logs every API call and every HCU frame. For debugging only.',

		updChannelName: 'Update channel',
		updChannelDesc: 'stable = vetted releases. experimental = prereleases (over-the-air, no new HCU image). For testers.',
		updModeName: 'Update mode',
		updModeDesc: 'manual = only on demand. auto = automatically install new versions on the selected channel.',
		updIntervalName: 'Update check interval (hours)',
		updIntervalDesc: 'How often to check for new versions in the background.',
		anEnabledName: 'Send anonymous usage statistics',
		anEnabledDesc: 'Opt-in. Sends anonymous aggregated counters (device count, version, channel) to the endpoint below. NO names, tokens, locations or device ids. Default: off.',
		anEndpointName: 'Analytics endpoint (https)',
		anEndpointDesc: 'Your own HTTPS endpoint that receives the statistics. Empty = nothing is sent.',
		anIntervalName: 'Analytics interval (hours)',
		anIntervalDesc: 'How often the anonymous statistics are sent.',

		statusLoggedIn: '✓ Connected to Home Connect.',
		statusLoggedInWithTime: ts => `✓ Connected to Home Connect (${ts}).`,
		statusPending: '⏳ Waiting for approval. Click the login link below.',
		statusError: msg => `✕ Login failed: ${msg}`,
		statusReady: 'Save the configuration to start the login.',
		statusEnterClientId: 'Enter your Client ID and save.',
	},
};

function tr(languageCode) {
	const code = (languageCode || '').toLowerCase().slice(0, 2);
	return I18N[code] || I18N.en;
}

function buildConfigTemplate(state, languageCode) {
	const cfg = state.config;
	const session = state.session;
	const verificationUrl = state.lastVerificationUrl;
	const verificationStatus = state.lastVerificationStatus;
	const isLoggedIn = !!session?.access_token;
	const t = tr(languageCode);

	const groups = {
		auth: { friendlyName: t.groupAuth, description: t.groupAuthDesc, order: 1 },
		devices: { friendlyName: t.groupDevices, description: t.groupDevicesDesc, order: 2 },
		advanced: { friendlyName: t.groupAdvanced, description: t.groupAdvancedDesc, order: 3 },
	};

	let statusText;
	if (isLoggedIn) {
		statusText = t.statusLoggedIn;
	} else if (verificationStatus?.state === 'pending') {
		statusText = t.statusPending;
	} else if (verificationStatus?.state === 'error') {
		statusText = t.statusError(verificationStatus.message || '');
	} else if (cfg.clientId) {
		statusText = t.statusReady;
	} else {
		statusText = t.statusEnterClientId;
	}

	const properties = {
		clientId: {
			friendlyName: t.clientIdName,
			description: t.clientIdDesc,
			dataType: 'STRING',
			groupId: 'auth',
			order: 2,
			required: 'true',
			minimumLength: 64,
			maximumLength: 64,
			currentValue: cfg.clientId || DEFAULT_CONFIG.clientId,
			defaultValue: DEFAULT_CONFIG.clientId,
		},
		loginStatus: {
			friendlyName: t.statusName,
			description: t.statusDesc,
			dataType: 'READONLY',
			groupId: 'auth',
			order: 3,
			currentValue: statusText,
		},

		enableSwitch: {
			friendlyName: t.switchName,
			description: t.switchDesc,
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 1,
			currentValue: String(cfg.enableSwitch),
			defaultValue: String(DEFAULT_CONFIG.enableSwitch),
		},
		enableLight: {
			friendlyName: t.lightName,
			description: t.lightDesc,
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 2,
			currentValue: String(cfg.enableLight),
			defaultValue: String(DEFAULT_CONFIG.enableLight),
		},
		enableClimate: {
			friendlyName: t.climateName,
			description: t.climateDesc,
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 3,
			currentValue: String(cfg.enableClimate),
			defaultValue: String(DEFAULT_CONFIG.enableClimate),
		},
		enablePrograms: {
			friendlyName: t.programsName,
			description: t.programsDesc,
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 4,
			currentValue: String(cfg.enablePrograms),
			defaultValue: String(DEFAULT_CONFIG.enablePrograms),
		},
		enableEnergy: {
			friendlyName: t.energyName,
			description: t.energyDesc,
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 5,
			currentValue: String(cfg.enableEnergy),
			defaultValue: String(DEFAULT_CONFIG.enableEnergy),
		},

		language: {
			friendlyName: t.languageName,
			description: t.languageDesc,
			dataType: 'STRING',
			groupId: 'advanced',
			order: 1,
			values: ['de-DE', 'en-GB', 'en-US', 'fr-FR', 'it-IT', 'es-ES', 'nl-NL', 'pl-PL', 'cs-CZ', 'tr-TR'],
			currentValue: cfg.language || DEFAULT_CONFIG.language,
			defaultValue: DEFAULT_CONFIG.language,
		},
		pollIntervalSec: {
			friendlyName: t.pollName,
			description: t.pollDesc,
			dataType: 'INTEGER',
			groupId: 'advanced',
			order: 2,
			minimum: 0,
			maximum: 3600,
			currentValue: String(cfg.pollIntervalSec ?? DEFAULT_CONFIG.pollIntervalSec),
			defaultValue: String(DEFAULT_CONFIG.pollIntervalSec),
		},
		debugDashboard: {
			friendlyName: t.dashName,
			description: t.dashDesc,
			dataType: 'BOOLEAN',
			groupId: 'advanced',
			order: 3,
			currentValue: String(cfg.debugDashboard),
			defaultValue: String(DEFAULT_CONFIG.debugDashboard),
		},
		debugDashboardPort: {
			friendlyName: t.dashPortName,
			description: t.dashPortDesc,
			dataType: 'INTEGER',
			groupId: 'advanced',
			order: 4,
			minimum: 1024,
			maximum: 65535,
			currentValue: String(cfg.debugDashboardPort ?? DEFAULT_CONFIG.debugDashboardPort),
			defaultValue: String(DEFAULT_CONFIG.debugDashboardPort),
		},
		verboseLogging: {
			friendlyName: t.verboseName,
			description: t.verboseDesc,
			dataType: 'BOOLEAN',
			groupId: 'advanced',
			order: 5,
			currentValue: String(cfg.verboseLogging),
			defaultValue: String(DEFAULT_CONFIG.verboseLogging),
		},

		updateChannel: {
			friendlyName: t.updChannelName,
			description: t.updChannelDesc,
			dataType: 'STRING',
			groupId: 'advanced',
			order: 6,
			values: ['stable', 'experimental'],
			currentValue: cfg.updateChannel || DEFAULT_CONFIG.updateChannel,
			defaultValue: DEFAULT_CONFIG.updateChannel,
		},
		updateMode: {
			friendlyName: t.updModeName,
			description: t.updModeDesc,
			dataType: 'STRING',
			groupId: 'advanced',
			order: 7,
			values: ['manual', 'auto'],
			currentValue: cfg.updateMode || DEFAULT_CONFIG.updateMode,
			defaultValue: DEFAULT_CONFIG.updateMode,
		},
		updateCheckIntervalHours: {
			friendlyName: t.updIntervalName,
			description: t.updIntervalDesc,
			dataType: 'INTEGER',
			groupId: 'advanced',
			order: 8,
			minimum: 1,
			maximum: 168,
			currentValue: String(cfg.updateCheckIntervalHours ?? DEFAULT_CONFIG.updateCheckIntervalHours),
			defaultValue: String(DEFAULT_CONFIG.updateCheckIntervalHours),
		},
		analyticsEnabled: {
			friendlyName: t.anEnabledName,
			description: t.anEnabledDesc,
			dataType: 'BOOLEAN',
			groupId: 'advanced',
			order: 9,
			currentValue: String(cfg.analyticsEnabled),
			defaultValue: String(DEFAULT_CONFIG.analyticsEnabled),
		},
		analyticsEndpoint: {
			friendlyName: t.anEndpointName,
			description: t.anEndpointDesc,
			dataType: 'STRING',
			groupId: 'advanced',
			order: 10,
			currentValue: cfg.analyticsEndpoint || DEFAULT_CONFIG.analyticsEndpoint,
			defaultValue: DEFAULT_CONFIG.analyticsEndpoint,
		},
		analyticsIntervalHours: {
			friendlyName: t.anIntervalName,
			description: t.anIntervalDesc,
			dataType: 'INTEGER',
			groupId: 'advanced',
			order: 11,
			minimum: 1,
			maximum: 168,
			currentValue: String(cfg.analyticsIntervalHours ?? DEFAULT_CONFIG.analyticsIntervalHours),
			defaultValue: String(DEFAULT_CONFIG.analyticsIntervalHours),
		},
	};

	// While the device flow is waiting for user approval: one big clickable
	// link to api.home-connect.com plus a QR code. Public URL → works from
	// any device with internet, no LAN-IP guesswork.
	if (verificationUrl && !isLoggedIn) {
		properties.verificationLink = {
			friendlyName: t.linkName,
			description: t.linkDesc,
			dataType: 'WEBLINK',
			groupId: 'auth',
			order: 4,
			currentValue: verificationUrl,
			defaultValue: t.linkName,
		};
		properties.verificationQr = {
			friendlyName: t.qrName,
			description: t.qrDesc,
			dataType: 'QRCODE',
			groupId: 'auth',
			order: 5,
			currentValue: verificationUrl,
		};
	}

	// Setup wizard URL goes at the very top of the auth section while
	// logged out. We deliberately render it as READONLY with a placeholder
	// IP/hostname instead of a clickable WEBLINK to the container IP —
	// that container IP only resolves on the same host, while users will
	// open this URL from their phone/laptop using whatever hostname they
	// also use for HCUweb.
	if (!isLoggedIn) {
		properties.setupUrl = {
			friendlyName: t.setupUrlName,
			description: t.setupUrlDesc,
			dataType: 'READONLY',
			groupId: 'auth',
			order: 1,
			currentValue: tr(languageCode) === I18N.de
				? 'http://<deine-HCU-IP>:8124/'
				: 'http://<your-hcu-address>:8124/',
		};
	}

	// "Reset login" only makes sense once you actually have a login.
	if (isLoggedIn) {
		properties.resetSession = {
			friendlyName: t.resetName,
			description: t.resetDesc,
			dataType: 'BOOLEAN',
			groupId: 'auth',
			order: 9,
			currentValue: String(cfg.resetSession),
			defaultValue: String(DEFAULT_CONFIG.resetSession),
		};
	}

	return { groups, properties };
}

/**
 * Format an ISO timestamp like "12:34" for a compact status display.
 */
function formatTs(iso) {
	try {
		const d = new Date(iso);
		const hh = String(d.getHours()).padStart(2, '0');
		const mm = String(d.getMinutes()).padStart(2, '0');
		return `${hh}:${mm}`;
	} catch {
		return iso;
	}
}

/**
 * Apply the values from a CONFIG_UPDATE_REQUEST onto the state.
 * Returns the new config + a list of properties that changed.
 *
 * Per the Connect API spec (ConfigUpdateRequest), `properties` is a
 * `Map<String, Object>` mapping property identifier directly to its new value:
 *   { clientId: "abc-123", pollIntervalSec: 300, enableSwitch: true }
 *
 * For robustness we also accept the template-style `{ currentValue: ... }`
 * shape that some HCU firmware variants have been seen to send.
 */
function applyConfigUpdate(state, properties) {
	const next = { ...state.config };
	const changed = [];
	for (const [key, prop] of Object.entries(properties || {})) {
		if (!(key in next)) continue;
		const value = extractValue(prop);
		if (value === undefined) continue;
		const coerced = coerce(next[key], value);
		if (next[key] !== coerced) {
			changed.push(key);
			next[key] = coerced;
		}
	}
	state.config = next;
	return { config: next, changed };
}

function extractValue(prop) {
	if (prop === null || prop === undefined) return undefined;
	if (typeof prop === 'object' && !Array.isArray(prop) && 'currentValue' in prop) {
		return prop.currentValue;
	}
	return prop;
}

function coerce(target, value) {
	if (typeof target === 'boolean') {
		if (typeof value === 'boolean') return value;
		if (typeof value === 'string') return value.toLowerCase() === 'true';
		return Boolean(value);
	}
	if (typeof target === 'number') {
		const n = typeof value === 'number' ? value : parseInt(value, 10);
		return Number.isFinite(n) ? n : target;
	}
	return value == null ? target : String(value);
}

module.exports = { buildConfigTemplate, applyConfigUpdate, I18N };
