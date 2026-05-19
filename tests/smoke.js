'use strict';

/**
 * Minimal smoke test:
 *  - boots the plugin pointed at a non-existent HCU
 *  - enables the debug dashboard
 *  - verifies the dashboard endpoints respond
 *  - verifies CONFIG template + mapping pure-functions
 *
 * No external network calls. No HCU/HomeConnect required.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Plugin } = require('../src/index');
const { buildConfigTemplate, applyConfigUpdate } = require('../src/config');
const { buildDevices, controlRequestToAction, applianceUpdateToFeatures, POWER_KEY, POWER_ON, POWER_OFF, LIGHT_KEY } = require('../src/mapping');

(async () => {
	// 1. Pure mapping tests
	const appliance = {
		haId: 'BOSCH-DISH-1234',
		type: 'Dishwasher',
		brand: 'Bosch',
		name: 'Geschirrspüler',
		vib: '12.34.56',
	};
	const settings = [{ key: POWER_KEY, value: POWER_OFF }];
	const status = [];
	const cfg = { enableSwitch: true, enableLight: true, enableClimate: true, enablePrograms: true, enableEnergy: true };
	const devs = buildDevices(appliance, settings, status, cfg);
	assert.strictEqual(devs.length, 3, 'dishwasher should yield SWITCH (power) + SWITCH (program) + ENERGY_METER');
	const sortedRoles = devs.map(d => d.role).sort();
	assert.deepStrictEqual(sortedRoles, ['energy', 'power', 'program']);
	const powerDev = devs.find(d => d.role === 'power');
	assert.strictEqual(powerDev.deviceType, 'SWITCH');
	assert.strictEqual(powerDev.features[0].on, false);

	const action = controlRequestToAction(powerDev, { features: [{ type: 'switchState', on: true }] });
	assert.deepStrictEqual(action, {
		kind: 'setSetting',
		haId: 'BOSCH-DISH-1234',
		key: POWER_KEY,
		value: POWER_ON,
	});

	const programDev = devs.find(d => d.role === 'program');
	const startAction = controlRequestToAction(programDev, { features: [{ type: 'switchState', on: true }] });
	assert.deepStrictEqual(startAction, { kind: 'startProgram', haId: 'BOSCH-DISH-1234' });
	const stopAction = controlRequestToAction(programDev, { features: [{ type: 'switchState', on: false }] });
	assert.deepStrictEqual(stopAction, { kind: 'stopProgram', haId: 'BOSCH-DISH-1234' });

	const updates = applianceUpdateToFeatures(devs, [{ key: POWER_KEY, value: POWER_ON }]);
	assert.strictEqual(updates.length, 1);
	assert.strictEqual(updates[0].features[0].on, true);

	const { OPERATION_STATE_KEY, OPERATION_STATE_RUN } = require('../src/mapping');
	const programUpdates = applianceUpdateToFeatures(devs, [{ key: OPERATION_STATE_KEY, value: OPERATION_STATE_RUN }]);
	// Now both program SWITCH and ENERGY_METER should update
	assert.strictEqual(programUpdates.length, 2, 'OperationState=Run should update program switch and energy meter');
	const progUpd = programUpdates.find(u => u.deviceId.endsWith('::program'));
	assert.strictEqual(progUpd.features[0].on, true);
	const energyUpd = programUpdates.find(u => u.deviceId.endsWith('::energy'));
	const wattsFeat = energyUpd.features.find(f => f.type === 'currentPower');
	assert.ok(wattsFeat.currentPower > 0, 'currentPower should be > 0 while running');

	// Light + climate combo (Hood + FridgeFreezer-like via mock)
	const fridge = {
		haId: 'BSH-FRIDGE-1',
		type: 'FridgeFreezer',
		brand: 'Siemens',
		name: 'Kühl-/Gefrierkomb.',
		vib: '1.0',
	};
	const fridgeSettings = [
		{ key: POWER_KEY, value: POWER_ON },
		{ key: LIGHT_KEY, value: true },
		{ key: 'Refrigeration.FridgeFreezer.Setting.SetpointTemperatureRefrigerator', value: 4 },
	];
	const fdevs = buildDevices(fridge, fridgeSettings, [], cfg);
	const types = fdevs.map(d => d.deviceType).sort();
	assert.deepStrictEqual(types, ['CLIMATE_SENSOR', 'LIGHT', 'SWITCH']);

	// 2. Config template / update round-trip
	const fakeState = { config: { clientId: '', language: 'de-DE', pollIntervalSec: 0, debugDashboard: false, debugDashboardPort: 8123, enableSwitch: true, enableLight: true, enableClimate: true, enablePrograms: true, enableEnergy: true, resetSession: false, verboseLogging: false } };
	const tpl = buildConfigTemplate(fakeState);
	assert.ok(tpl.properties.clientId);
	assert.ok(tpl.groups.auth);
	const { config, changed } = applyConfigUpdate(fakeState, {
		clientId: { currentValue: 'abc-123' },
		debugDashboard: { currentValue: 'true' },
		pollIntervalSec: { currentValue: '300' },
	});
	assert.strictEqual(config.clientId, 'abc-123');
	assert.strictEqual(config.debugDashboard, true);
	assert.strictEqual(config.pollIntervalSec, 300);
	assert.ok(changed.includes('clientId'));

	// 3. Boot plugin against a fake "host" with no HCU; just verify dashboard works.
	const tmpToken = path.join(__dirname, '..', 'data', 'TOKEN');
	fs.mkdirSync(path.dirname(tmpToken), { recursive: true });
	fs.writeFileSync(tmpToken, 'fake-token');

	const plugin = new Plugin({
		pluginId: 'de.kiro.plugin.homeconnect.test',
		host: '127.0.0.1', // nothing listening on 9001 — that's fine, we just want the dashboard
		tokenFile: tmpToken,
	});
	plugin.state.config = { ...plugin.state.config, debugDashboard: true, debugDashboardPort: 18123 };
	plugin.dashboard.start(18123);

	await new Promise(r => setTimeout(r, 300));

	const html = await httpGet('http://127.0.0.1:18123/');
	assert.ok(html.includes('HMIP HomeConnect Plugin'), 'dashboard should serve HTML');
	const stateJson = JSON.parse(await httpGet('http://127.0.0.1:18123/api/state'));
	assert.strictEqual(stateJson.pluginId, 'de.kiro.plugin.homeconnect.test');
	assert.ok(Array.isArray(stateJson.hcuDevices));

	plugin.dashboard.stop();
	console.log('SMOKE TESTS OK');
	process.exit(0);
})().catch(e => {
	console.error('SMOKE TEST FAILED:', e);
	process.exit(1);
});

function httpGet(u) {
	return new Promise((resolve, reject) => {
		http.get(u, res => {
			let data = '';
			res.on('data', c => (data += c));
			res.on('end', () => resolve(data));
		}).on('error', reject);
	});
}
