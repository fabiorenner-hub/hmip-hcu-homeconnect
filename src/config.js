'use strict';

const { DEFAULT_CONFIG } = require('./state');

/**
 * Builds the body for CONFIG_TEMPLATE_RESPONSE.
 *
 * The HCU renders this template on the plugin configuration page.
 */
function buildConfigTemplate(state) {
	const cfg = state.config;

	const groups = {
		auth: { friendlyName: 'Home Connect Login', description: 'OAuth2 device flow credentials', order: 1 },
		general: { friendlyName: 'Allgemein', description: 'Sprache und Polling', order: 2 },
		devices: { friendlyName: 'Gerätearten', description: 'Welche Funktionen werden als HCU-Geräte angelegt?', order: 3 },
		debug: { friendlyName: 'Debug', description: 'Debug-Optionen', order: 4 },
	};

	const properties = {
		clientId: {
			friendlyName: 'Home Connect Client ID',
			description: 'Aus deiner Home Connect Developer Application (OAuth Flow: Device Flow).',
			dataType: 'STRING',
			groupId: 'auth',
			order: 1,
			required: 'true',
			minimumLength: 10,
			maximumLength: 200,
			currentValue: cfg.clientId || DEFAULT_CONFIG.clientId,
			defaultValue: DEFAULT_CONFIG.clientId,
		},
		resetSession: {
			friendlyName: 'Login zurücksetzen',
			description: 'Setzt den gespeicherten Refresh-Token zurück. Beim nächsten Start wird ein neuer Device-Flow gestartet.',
			dataType: 'BOOLEAN',
			groupId: 'auth',
			order: 2,
			currentValue: String(cfg.resetSession),
			defaultValue: String(DEFAULT_CONFIG.resetSession),
		},
		language: {
			friendlyName: 'Sprache (Accept-Language)',
			description: 'Sprache, in der Programmnamen und Optionen ausgeliefert werden.',
			dataType: 'STRING',
			groupId: 'general',
			order: 1,
			values: ['de-DE', 'en-GB', 'en-US', 'fr-FR', 'it-IT', 'es-ES', 'nl-NL', 'pl-PL', 'cs-CZ', 'tr-TR'],
			currentValue: cfg.language || DEFAULT_CONFIG.language,
			defaultValue: DEFAULT_CONFIG.language,
		},
		pollIntervalSec: {
			friendlyName: 'Polling-Intervall (s)',
			description: 'Optional: zusätzlich zum Event-Stream periodisch alle Geräte pollen. 0 = aus.',
			dataType: 'INTEGER',
			groupId: 'general',
			order: 2,
			minimum: 0,
			maximum: 3600,
			currentValue: String(cfg.pollIntervalSec ?? DEFAULT_CONFIG.pollIntervalSec),
			defaultValue: String(DEFAULT_CONFIG.pollIntervalSec),
		},
		enableSwitch: {
			friendlyName: 'Power als SWITCH',
			description: 'Erstelle ein HCU SWITCH-Gerät für die Power-State-Einstellung jedes Geräts.',
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 1,
			currentValue: String(cfg.enableSwitch),
			defaultValue: String(DEFAULT_CONFIG.enableSwitch),
		},
		enableLight: {
			friendlyName: 'Innen-/Ambientelicht als LIGHT',
			description: 'Erstelle ein HCU LIGHT-Gerät für Geräte mit steuerbarem Innenlicht (Hood, Oven, Fridge).',
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 2,
			currentValue: String(cfg.enableLight),
			defaultValue: String(DEFAULT_CONFIG.enableLight),
		},
		enableClimate: {
			friendlyName: 'Kühltemperatur als CLIMATE_SENSOR',
			description: 'Erstelle einen HCU CLIMATE_SENSOR mit der eingestellten Kühl-/Gefriertemperatur.',
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 3,
			currentValue: String(cfg.enableClimate),
			defaultValue: String(DEFAULT_CONFIG.enableClimate),
		},
		enablePrograms: {
			friendlyName: 'Programme als SWITCH',
			description: 'Erstellt pro Gerät einen Programm-Switch (ON = aktuelles Programm starten, OFF = abbrechen).',
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 4,
			currentValue: String(cfg.enablePrograms),
			defaultValue: String(DEFAULT_CONFIG.enablePrograms),
		},
		enableEnergy: {
			friendlyName: 'Energiezähler (geschätzt)',
			description: 'Erstellt pro Gerät einen ENERGY_METER. Da Home Connect keine Live-Leistungsdaten liefert, wird ein typischer Verbrauch verwendet, solange ein Programm läuft.',
			dataType: 'BOOLEAN',
			groupId: 'devices',
			order: 5,
			currentValue: String(cfg.enableEnergy),
			defaultValue: String(DEFAULT_CONFIG.enableEnergy),
		},
		debugDashboard: {
			friendlyName: 'Debug Dashboard aktivieren',
			description: 'Stellt unter http://<host>:<port>/ ein Diagnose-UI bereit.',
			dataType: 'BOOLEAN',
			groupId: 'debug',
			order: 1,
			currentValue: String(cfg.debugDashboard),
			defaultValue: String(DEFAULT_CONFIG.debugDashboard),
		},
		debugDashboardPort: {
			friendlyName: 'Debug Dashboard Port',
			description: 'TCP Port des Debug-Dashboards (1024-65535).',
			dataType: 'INTEGER',
			groupId: 'debug',
			order: 2,
			minimum: 1024,
			maximum: 65535,
			currentValue: String(cfg.debugDashboardPort ?? DEFAULT_CONFIG.debugDashboardPort),
			defaultValue: String(DEFAULT_CONFIG.debugDashboardPort),
		},
		verboseLogging: {
			friendlyName: 'Ausführliches Logging',
			description: 'Loggt jeden API-Call und WebSocket-Frame.',
			dataType: 'BOOLEAN',
			groupId: 'debug',
			order: 3,
			currentValue: String(cfg.verboseLogging),
			defaultValue: String(DEFAULT_CONFIG.verboseLogging),
		},
	};

	return { groups, properties };
}

/**
 * Apply the values from a CONFIG_UPDATE_REQUEST onto the state.
 * Returns the new config + a list of properties that changed.
 */
function applyConfigUpdate(state, properties) {
	const next = { ...state.config };
	const changed = [];
	for (const [key, prop] of Object.entries(properties || {})) {
		if (!(key in next)) continue;
		const value = prop?.currentValue;
		const coerced = coerce(next[key], value);
		if (next[key] !== coerced) {
			changed.push(key);
			next[key] = coerced;
		}
	}
	state.config = next;
	return { config: next, changed };
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

module.exports = { buildConfigTemplate, applyConfigUpdate };
