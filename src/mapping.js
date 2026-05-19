'use strict';

/**
 * Maps Home Connect appliances to HCU plugin device(s).
 *
 * A single Home Connect appliance can yield multiple HCU devices because the
 * Connect API has narrow archetypes. For example a fridge/freezer becomes
 * a CLIMATE_SENSOR (temperature) and optionally a SWITCH (power state).
 *
 * Returned shape (per HCU device):
 * {
 *   deviceId: string,        // unique within the plugin
 *   sourceHaId: string,      // Home Connect haId
 *   role: string,            // e.g. 'power', 'fridge_temp', 'lamp'
 *   deviceType: string,      // HCU DeviceType enum
 *   firmwareVersion: string,
 *   friendlyName: string,
 *   modelType: string,
 *   features: Feature[],
 * }
 */

const POWER_KEY = 'BSH.Common.Setting.PowerState';
const POWER_ON = 'BSH.Common.EnumType.PowerState.On';
const POWER_OFF = 'BSH.Common.EnumType.PowerState.Off';
const POWER_STBY = 'BSH.Common.EnumType.PowerState.Standby';

const TEMP_FRIDGE = 'Refrigeration.FridgeFreezer.Setting.SetpointTemperatureRefrigerator';
const TEMP_FREEZER = 'Refrigeration.FridgeFreezer.Setting.SetpointTemperatureFreezer';

const LIGHT_KEY = 'BSH.Common.Setting.AmbientLightEnabled';

const APPLIANCES_WITH_LIGHT = new Set(['Hood', 'Refrigerator', 'FridgeFreezer', 'WineCooler', 'Oven']);
const APPLIANCES_CLIMATE = new Set(['FridgeFreezer', 'Refrigerator', 'Freezer', 'WineCooler']);
const APPLIANCES_WITH_PROGRAMS = new Set([
	'Dishwasher', 'Washer', 'Dryer', 'WasherDryer',
	'Oven', 'CoffeeMaker', 'Hood', 'CleaningRobot',
	'CookProcessor', 'Microwave', 'WarmingDrawer',
]);

/**
 * Typical electrical power draw per appliance type while a program is running,
 * in watts. These are best-effort averages — Home Connect does not expose live
 * power readings. Customize here if you need accuracy for your specific model.
 */
const TYPICAL_POWER_W = {
	Dishwasher: 1500,
	Washer: 1800,
	Dryer: 2500,
	WasherDryer: 2200,
	Oven: 2000,
	CoffeeMaker: 1300,
	Hood: 150,
	CleaningRobot: 30,
	CookProcessor: 1100,
	Microwave: 1100,
	WarmingDrawer: 800,
	Cooktop: 2000,
};
const APPLIANCES_WITH_ENERGY = new Set(Object.keys(TYPICAL_POWER_W));

const OPERATION_STATE_KEY = 'BSH.Common.Status.OperationState';
const OPERATION_STATE_RUN = 'BSH.Common.EnumType.OperationState.Run';

function isProgramRunning(statusMap) {
	return statusMap.get(OPERATION_STATE_KEY) === OPERATION_STATE_RUN;
}

function typicalPowerForType(type) {
	return TYPICAL_POWER_W[type] || 0;
}

function buildDevices(appliance, settings, status, config) {
	const out = [];
	const fw = appliance.vib || appliance.enumber || '1.0.0';
	const baseName = appliance.name || appliance.brand || appliance.type;

	const settingMap = new Map();
	for (const s of settings || []) settingMap.set(s.key, s.value);
	const statusMap = new Map();
	for (const s of status || []) statusMap.set(s.key, s.value);

	if (config.enableSwitch && settingMap.has(POWER_KEY)) {
		out.push({
			deviceId: `${appliance.haId}::power`,
			sourceHaId: appliance.haId,
			role: 'power',
			deviceType: 'SWITCH',
			firmwareVersion: fw,
			friendlyName: baseName,
			modelType: appliance.type,
			features: [
				{
					type: 'switchState',
					on: isOn(settingMap.get(POWER_KEY)),
				},
			],
		});
	}

	if (config.enableLight && APPLIANCES_WITH_LIGHT.has(appliance.type) && settingMap.has(LIGHT_KEY)) {
		out.push({
			deviceId: `${appliance.haId}::light`,
			sourceHaId: appliance.haId,
			role: 'lamp',
			deviceType: 'LIGHT',
			firmwareVersion: fw,
			friendlyName: `${baseName} Licht`,
			modelType: appliance.type,
			features: [
				{
					type: 'switchState',
					on: !!settingMap.get(LIGHT_KEY),
				},
			],
		});
	}

	if (config.enablePrograms && APPLIANCES_WITH_PROGRAMS.has(appliance.type)) {
		out.push({
			deviceId: `${appliance.haId}::program`,
			sourceHaId: appliance.haId,
			role: 'program',
			deviceType: 'SWITCH',
			firmwareVersion: fw,
			friendlyName: `${baseName} Programm`,
			modelType: appliance.type,
			features: [
				{
					type: 'switchState',
					on: isProgramRunning(statusMap),
				},
			],
		});
	}

	if (config.enableEnergy && APPLIANCES_WITH_ENERGY.has(appliance.type)) {
		const running = isProgramRunning(statusMap);
		const currentPower = running ? typicalPowerForType(appliance.type) : 0;
		const energyCounter = numericOrNull(config._energyCounters?.[appliance.haId]) || 0;
		out.push({
			deviceId: `${appliance.haId}::energy`,
			sourceHaId: appliance.haId,
			role: 'energy',
			deviceType: 'ENERGY_METER',
			firmwareVersion: fw,
			friendlyName: `${baseName} Energie`,
			modelType: appliance.type,
			features: [
				{ type: 'currentPower', currentPower },
				{ type: 'energyCounter', energyCounter },
			],
		});
	}

	if (config.enableClimate && APPLIANCES_CLIMATE.has(appliance.type)) {
		const tempVal = numericOrNull(settingMap.get(TEMP_FRIDGE) ?? settingMap.get(TEMP_FREEZER));
		out.push({
			deviceId: `${appliance.haId}::climate`,
			sourceHaId: appliance.haId,
			role: settingMap.has(TEMP_FRIDGE) ? 'fridge_temp' : 'freezer_temp',
			deviceType: 'CLIMATE_SENSOR',
			firmwareVersion: fw,
			friendlyName: `${baseName} Temperatur`,
			modelType: appliance.type,
			features: tempVal != null
				? [{ type: 'actualTemperature', actualTemperature: tempVal }]
				: [],
		});
	}

	return out;
}

function isOn(value) {
	if (value === true) return true;
	if (typeof value === 'string') return value === POWER_ON;
	return false;
}

function numericOrNull(v) {
	const n = typeof v === 'number' ? v : parseFloat(v);
	return Number.isFinite(n) ? n : null;
}

/**
 * Apply an HCU control request body to the Home Connect appliance.
 * Returns a structured action description for the api layer to execute.
 */
function controlRequestToAction(hcuDevice, controlBody) {
	const features = controlBody?.features || [];
	const switchFeat = features.find(f => f.type === 'switchState');

	if (hcuDevice.role === 'power' && switchFeat) {
		return {
			kind: 'setSetting',
			haId: hcuDevice.sourceHaId,
			key: POWER_KEY,
			value: switchFeat.on ? POWER_ON : POWER_OFF,
		};
	}
	if (hcuDevice.role === 'lamp' && switchFeat) {
		return {
			kind: 'setSetting',
			haId: hcuDevice.sourceHaId,
			key: LIGHT_KEY,
			value: !!switchFeat.on,
		};
	}
	if (hcuDevice.role === 'program' && switchFeat) {
		return {
			kind: switchFeat.on ? 'startProgram' : 'stopProgram',
			haId: hcuDevice.sourceHaId,
		};
	}
	return { kind: 'unsupported', reason: 'No matching feature/role for control request' };
}

/**
 * Turn an SSE stream item into HCU feature updates per HCU device.
 * Returns an array of { deviceId, features }.
 */
function applianceUpdateToFeatures(hcuDevices, items) {
	const updates = [];
	for (const item of items || []) {
		switch (item.key) {
			case POWER_KEY: {
				const dev = hcuDevices.find(d => d.role === 'power');
				if (dev) {
					updates.push({
						deviceId: dev.deviceId,
						features: [{ type: 'switchState', on: isOn(item.value) }],
					});
				}
				break;
			}
			case LIGHT_KEY: {
				const dev = hcuDevices.find(d => d.role === 'lamp');
				if (dev) {
					updates.push({
						deviceId: dev.deviceId,
						features: [{ type: 'switchState', on: !!item.value }],
					});
				}
				break;
			}
			case TEMP_FRIDGE:
			case TEMP_FREEZER: {
				const dev = hcuDevices.find(d => d.role === 'fridge_temp' || d.role === 'freezer_temp');
				const v = numericOrNull(item.value);
				if (dev && v != null) {
					updates.push({
						deviceId: dev.deviceId,
						features: [{ type: 'actualTemperature', actualTemperature: v }],
					});
				}
				break;
			}
			case OPERATION_STATE_KEY: {
				const dev = hcuDevices.find(d => d.role === 'program');
				if (dev) {
					updates.push({
						deviceId: dev.deviceId,
						features: [{ type: 'switchState', on: item.value === OPERATION_STATE_RUN }],
					});
				}
				const energyDev = hcuDevices.find(d => d.role === 'energy');
				if (energyDev) {
					const running = item.value === OPERATION_STATE_RUN;
					const watts = running ? typicalPowerForType(energyDev.modelType) : 0;
					// Preserve last known counter value
					const counterFeat = energyDev.features.find(f => f.type === 'energyCounter');
					const energyCounter = counterFeat ? counterFeat.energyCounter : 0;
					updates.push({
						deviceId: energyDev.deviceId,
						features: [
							{ type: 'currentPower', currentPower: watts },
							{ type: 'energyCounter', energyCounter },
						],
					});
				}
				break;
			}
			default:
				// ignored — extend mapping here for additional features
				break;
		}
	}
	return updates;
}

module.exports = {
	buildDevices,
	controlRequestToAction,
	applianceUpdateToFeatures,
	POWER_KEY,
	POWER_ON,
	POWER_OFF,
	POWER_STBY,
	LIGHT_KEY,
	OPERATION_STATE_KEY,
	OPERATION_STATE_RUN,
	APPLIANCES_WITH_PROGRAMS,
	APPLIANCES_WITH_ENERGY,
	typicalPowerForType,
};
