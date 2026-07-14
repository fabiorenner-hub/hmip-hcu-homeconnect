'use strict';

const { createHash, verify: edVerify } = require('node:crypto');

function sha256Hex(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function sha256Matches(bytes, expected) {
	return sha256Hex(bytes).toLowerCase() === String(expected || '').toLowerCase();
}

/**
 * Optional Ed25519 signature check. No key configured → no-op (true).
 * Key present + missing/broken signature → false.
 */
function verifySignature(bytes, signatureB64, publicKeyPem) {
	if (!publicKeyPem) return true;
	if (!signatureB64) return false;
	try {
		return edVerify(null, bytes, publicKeyPem, Buffer.from(signatureB64, 'base64'));
	} catch {
		return false;
	}
}

module.exports = { sha256Hex, sha256Matches, verifySignature };
