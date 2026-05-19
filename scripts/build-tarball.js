#!/usr/bin/env node
'use strict';

/**
 * Builds a distributable source tarball under ./dist/.
 *
 * Output: dist/hmip-hcu-homeconnect-<version>.tar.gz
 * Contents: src/, tests/, package.json, package-lock.json, Dockerfile,
 *           README.md, LICENSE, CHANGELOG.md
 *
 * Uses the system `tar` (available on Windows 10+, macOS and Linux).
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const distDir = path.join(ROOT, 'dist');

if (!fs.existsSync(distDir)) {
	fs.mkdirSync(distDir, { recursive: true });
}

const stem = `hmip-hcu-homeconnect-${pkg.version}`;
const tarballName = `${stem}.tar.gz`;
const outFile = path.join(distDir, tarballName);

const include = [
	'src',
	'tests',
	'scripts',
	'package.json',
	'package-lock.json',
	'Dockerfile',
	'README.md',
	'LICENSE',
	'CHANGELOG.md',
];
const exists = include.filter(p => fs.existsSync(path.join(ROOT, p)));

if (fs.existsSync(outFile)) {
	fs.unlinkSync(outFile);
}

// `tar` accepts a transform on macOS/Linux but not on Windows bsdtar.
// To get a clean top-level directory inside the archive on every platform,
// we stage the files into a temp folder named after the stem first.
const stage = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hmip-pkg-'));
const stageRoot = path.join(stage, stem);
fs.mkdirSync(stageRoot);

function copyRecursive(src, dst) {
	const stat = fs.statSync(src);
	if (stat.isDirectory()) {
		fs.mkdirSync(dst, { recursive: true });
		for (const entry of fs.readdirSync(src)) {
			copyRecursive(path.join(src, entry), path.join(dst, entry));
		}
	} else {
		fs.copyFileSync(src, dst);
	}
}

for (const rel of exists) {
	copyRecursive(path.join(ROOT, rel), path.join(stageRoot, rel));
}

execFileSync('tar', ['-czf', outFile, '-C', stage, stem], { stdio: 'inherit' });

fs.rmSync(stage, { recursive: true, force: true });

const size = fs.statSync(outFile).size;
console.log(`✔ ${tarballName} (${(size / 1024).toFixed(1)} KiB) → ${path.relative(ROOT, outFile)}`);
