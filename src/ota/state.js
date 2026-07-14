'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Persistent OTA state at <dataDir>/ota/state.json. Written atomically
 * (temp + rename). Read defensively with a schema fallback.
 *
 * Shape: { activeVersion, bootAttempts, lastGoodAt, quarantined: [] }
 *
 * This module is intentionally node-builtins-only so the bootstrap loader
 * can use it without pulling in app code.
 */

function defaults() {
	return { activeVersion: null, bootAttempts: 0, lastGoodAt: null, quarantined: [] };
}

function stateFile(dataDir) {
	return path.join(dataDir, 'ota', 'state.json');
}

function readState(dataDir) {
	try {
		const raw = fs.readFileSync(stateFile(dataDir), 'utf8');
		const parsed = JSON.parse(raw);
		if (parsed === null || typeof parsed !== 'object') return defaults();
		return {
			activeVersion: typeof parsed.activeVersion === 'string' ? parsed.activeVersion : null,
			bootAttempts: Number.isInteger(parsed.bootAttempts) && parsed.bootAttempts >= 0 ? parsed.bootAttempts : 0,
			lastGoodAt: typeof parsed.lastGoodAt === 'string' ? parsed.lastGoodAt : null,
			quarantined: Array.isArray(parsed.quarantined) ? parsed.quarantined.filter(v => typeof v === 'string') : [],
		};
	} catch {
		return defaults();
	}
}

function writeState(dataDir, state) {
	const file = stateFile(dataDir);
	const dir = path.dirname(file);
	try {
		fs.mkdirSync(dir, { recursive: true });
		const tmp = `${file}.tmp-${process.pid}`;
		fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
		fs.renameSync(tmp, file);
	} catch {
		/* best-effort */
	}
}

function updateState(dataDir, patch) {
	const next = { ...readState(dataDir), ...patch };
	writeState(dataDir, next);
	return next;
}

function quarantine(dataDir, version) {
	const s = readState(dataDir);
	const set = new Set(s.quarantined);
	if (version) set.add(version);
	writeState(dataDir, { ...s, quarantined: Array.from(set), bootAttempts: 0, activeVersion: null });
}

module.exports = { defaults, stateFile, readState, writeState, updateState, quarantine };
