#!/usr/bin/env node
'use strict';

/**
 * Bundles the plugin into a single self-contained CommonJS file so it can run
 * as an OTA payload (which has no node_modules) as well as the image bundle.
 *
 * Outputs:
 *   dist/plugin/index.js      — bundled app (exports { Plugin, main })
 *   dist/bootstrap/loader.js  — copied verbatim (node-builtins only, never bundled)
 */

import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(ROOT, 'dist');
const pluginDir = path.join(distDir, 'plugin');
const bootstrapDir = path.join(distDir, 'bootstrap');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(pluginDir, { recursive: true });
fs.mkdirSync(bootstrapDir, { recursive: true });

await build({
	entryPoints: [path.join(ROOT, 'src', 'index.js')],
	outfile: path.join(pluginDir, 'index.js'),
	bundle: true,
	platform: 'node',
	format: 'cjs',
	target: 'node20',
	// Optional native ws speedups — resolved at runtime if present, ignored if not.
	external: ['bufferutil', 'utf-8-validate'],
	legalComments: 'none',
	logLevel: 'info',
});

// The loader must stay node-builtins-only and is NEVER bundled with app code.
fs.copyFileSync(
	path.join(ROOT, 'src', 'bootstrap', 'loader.js'),
	path.join(bootstrapDir, 'loader.js'),
);

const size = fs.statSync(path.join(pluginDir, 'index.js')).size;
console.log(`\u2714 dist/plugin/index.js (${(size / 1024).toFixed(1)} KiB)`);
console.log('\u2714 dist/bootstrap/loader.js');
