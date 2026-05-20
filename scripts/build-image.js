#!/usr/bin/env node
'use strict';

/**
 * Builds the HCU plugin image tarball.
 *
 * The HCU expects a `docker save` image tarball with the
 * `de.eq3.hmip.plugin.metadata` label set on the image. Source archives are
 * rejected as "not valid". This script delegates to the platform-specific
 * builder (build.ps1 on Windows, build.sh elsewhere) which:
 *  - reads the version from package.json
 *  - builds for linux/arm64 (HCU CPU) via docker buildx
 *  - saves the image to dist/hmip-hcu-homeconnect-<version>.tar.gz
 *  - mirrors the latest tarball into the repo root and removes older copies
 */

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

let cmd;
let args;
if (isWindows) {
	cmd = 'powershell.exe';
	args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'build.ps1')];
} else {
	cmd = 'bash';
	args = [path.join(ROOT, 'build.sh')];
}

const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
if (result.error) {
	console.error('Failed to invoke builder:', result.error.message);
	process.exit(1);
}
process.exit(result.status ?? 1);
