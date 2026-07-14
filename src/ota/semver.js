'use strict';

/** Parse "vX.Y.Z[-pre][+build]" → [X, Y, Z] (missing/invalid parts → 0). */
function parseSemver(v) {
	const core = String(v || '').trim().replace(/^v/iu, '').split(/[-+]/u)[0] || '';
	const p = core.split('.');
	const num = s => {
		const n = Number.parseInt(s == null ? '0' : s, 10);
		return Number.isFinite(n) && n >= 0 ? n : 0;
	};
	return [num(p[0]), num(p[1]), num(p[2])];
}

function compareSemver(a, b) {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	for (let i = 0; i < 3; i += 1) {
		if (pa[i] > pb[i]) return 1;
		if (pa[i] < pb[i]) return -1;
	}
	return 0;
}

const isNewer = (a, b) => compareSemver(a, b) > 0;
const isAtLeast = (a, b) => compareSemver(a, b) >= 0;

/** Everything after the first "+" (the build tail). */
function buildTail(v) {
	const s = String(v || '');
	const i = s.indexOf('+');
	return i >= 0 ? s.slice(i + 1) : '';
}

/**
 * Experimental comparison: same X.Y.Z → compare build stamp lexicographically.
 * UTC timestamps sort correctly as strings. A tail always beats no tail.
 */
function isNewerWithBuild(a, b) {
	const c = compareSemver(a, b);
	if (c !== 0) return c > 0;
	const ta = buildTail(a);
	const tb = buildTail(b);
	if (ta === tb) return false;
	return ta > tb;
}

module.exports = { parseSemver, compareSemver, isNewer, isAtLeast, buildTail, isNewerWithBuild };
