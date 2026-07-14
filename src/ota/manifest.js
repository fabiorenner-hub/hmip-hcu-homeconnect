'use strict';

/**
 * OTA manifest validation. Hand-rolled (this repo has no zod dependency).
 * Shape:
 *   { version, minCoreVersion, sha256, assetUrl, bundleName,
 *     signature?, notes? }
 */

const SEMVER_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const SHA256_RE = /^[0-9a-f]{64}$/iu;

function isNonEmptyString(v) {
	return typeof v === 'string' && v.length > 0;
}

function validateManifest(obj) {
	if (obj === null || typeof obj !== 'object') return null;
	const o = obj;
	if (!isNonEmptyString(o.version) || !SEMVER_RE.test(o.version)) return null;
	if (!isNonEmptyString(o.minCoreVersion) || !SEMVER_RE.test(o.minCoreVersion)) return null;
	if (!isNonEmptyString(o.sha256) || !SHA256_RE.test(o.sha256)) return null;
	if (!isNonEmptyString(o.assetUrl) || !o.assetUrl.startsWith('https://')) return null;
	if (!isNonEmptyString(o.bundleName)) return null;
	if (o.signature != null && !isNonEmptyString(o.signature)) return null;
	if (o.notes != null && typeof o.notes !== 'string') return null;
	const out = {
		version: o.version,
		minCoreVersion: o.minCoreVersion,
		sha256: o.sha256,
		assetUrl: o.assetUrl,
		bundleName: o.bundleName,
	};
	if (o.signature != null) out.signature = o.signature;
	if (o.notes != null) out.notes = o.notes;
	// Loader-written field: hash of the unpacked main.js (not the bundle file).
	if (isNonEmptyString(o.mainSha256) && SHA256_RE.test(o.mainSha256)) out.mainSha256 = o.mainSha256;
	return out;
}

function parseManifestJson(json) {
	try {
		return validateManifest(JSON.parse(json));
	} catch {
		return null;
	}
}

module.exports = { validateManifest, parseManifestJson, SEMVER_RE, SHA256_RE };
