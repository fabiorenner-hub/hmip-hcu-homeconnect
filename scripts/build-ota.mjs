#!/usr/bin/env node
'use strict';

/**
 * Packs the bundled app (dist/plugin/index.js) into an OTA payload + manifest.
 *
 *   node scripts/build-ota.mjs stable
 *   node scripts/build-ota.mjs experimental
 *
 * Stable:       version = X.Y.Z,              tag v<X.Y.Z>, asset homeconnect-ota-<X.Y.Z>.json
 * Experimental: version = X.Y.Z+exp.<stamp>,  tag experimental, asset homeconnect-ota-exp.json
 *
 * Experimental NEVER bumps the version number — only the build tail changes.
 */

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const REPO = 'fabiorenner-hub/hmip-hcu-homeconnect';
const BUNDLE_FORMAT = 'homeconnect-ota-1';
const MIN_CORE = process.env.OTA_MIN_CORE || '0.7.0';

const channel = (process.argv[2] || 'stable').toLowerCase();
if (channel !== 'stable' && channel !== 'experimental') {
	console.error('usage: build-ota.mjs <stable|experimental>');
	process.exit(1);
}

const distDir = path.join(ROOT, 'dist');
const otaDir = path.join(distDir, 'ota');
const mainJsPath = path.join(distDir, 'plugin', 'index.js');

// Ensure the app bundle exists (reuse build-bundle output).
if (!fs.existsSync(mainJsPath)) {
	await build({
		entryPoints: [path.join(ROOT, 'src', 'index.js')],
		outfile: mainJsPath,
		bundle: true, platform: 'node', format: 'cjs', target: 'node20',
		external: ['bufferutil', 'utf-8-validate'], legalComments: 'none',
	});
}

fs.mkdirSync(otaDir, { recursive: true });

function utcStamp() {
	return new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d+Z$/u, 'Z');
}

const baseVersion = pkg.version;
const version = channel === 'experimental' ? `${baseVersion}+exp.${utcStamp()}` : baseVersion;
const bundleName = channel === 'experimental'
	? 'homeconnect-ota-exp.json'
	: `homeconnect-ota-${baseVersion}.json`;
const manifestName = channel === 'experimental' ? 'ota-manifest-exp.json' : 'ota-manifest.json';
const tag = channel === 'experimental' ? 'experimental' : `v${baseVersion}`;

// Build the payload bundle file.
const mainB64 = fs.readFileSync(mainJsPath).toString('base64');
const bundle = { format: BUNDLE_FORMAT, version, files: { 'main.js': mainB64 } };
const bundleJson = JSON.stringify(bundle);
fs.writeFileSync(path.join(otaDir, bundleName), bundleJson, 'utf8');

const sha256 = createHash('sha256').update(Buffer.from(bundleJson, 'utf8')).digest('hex');
const assetUrl = `https://github.com/${REPO}/releases/download/${tag}/${bundleName}`;

const manifest = {
	version,
	minCoreVersion: MIN_CORE,
	sha256,
	assetUrl,
	bundleName,
	notes: `${channel} OTA payload for ${pkg.name} ${version}`,
};
fs.writeFileSync(path.join(otaDir, manifestName), JSON.stringify(manifest, null, 2), 'utf8');

console.log(`\u2714 OTA payload built (${channel})`);
console.log(`   version:  ${version}`);
console.log(`   tag:      ${tag}`);
console.log(`   bundle:   dist/ota/${bundleName}  (${(bundleJson.length / 1024).toFixed(1)} KiB)`);
console.log(`   manifest: dist/ota/${manifestName}`);
console.log(`   sha256:   ${sha256}`);
