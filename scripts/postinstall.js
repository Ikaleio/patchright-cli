#!/usr/bin/env node

// Published packages bundle the fork's binaries. Source checkouts build them locally.
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const binDir = join(dirname(fileURLToPath(import.meta.url)), '../bin');
let osKey = platform();
if (osKey === 'linux') {
  try {
    if (execSync('ldd --version 2>&1 || true', { encoding: 'utf8' }).includes('musl')) {
      osKey = 'linux-musl';
    }
  } catch {
    if (existsSync('/lib/ld-musl-x86_64.so.1') || existsSync('/lib/ld-musl-aarch64.so.1')) {
      osKey = 'linux-musl';
    }
  }
}

const cpu = platform() === 'win32' && arch() === 'arm64' ? 'x64' : arch();
const binaryName = `agent-browser-${osKey}-${cpu}${platform() === 'win32' ? '.exe' : ''}`;
const binaryPath = join(binDir, binaryName);

if (existsSync(binaryPath)) {
  if (platform() !== 'win32') chmodSync(binaryPath, 0o755);
  console.log(`Native binary ready: ${binaryName}`);
} else {
  console.log('Native binary is missing. For a source checkout, run bun run build:native.');
}

const method = process.env.npm_config_user_agent?.match(/^(npm|pnpm|yarn|bun)\//)?.[1];
if (method) writeFileSync(join(binDir, '.install-method'), method);
console.log('Run prcli install if Google Chrome is not installed.');
