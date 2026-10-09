#!/usr/bin/env node

// Verify the actual npm file list before publishing or installing the tarball.
import { execFileSync } from 'node:child_process';

const [pkg] = JSON.parse(execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' }));
const files = new Set(pkg.files.map((file) => file.path));
const required = [
  'bin/patchright-cli.js',
  'bin/agent-browser.js',
  'bin/agent-browser-linux-x64',
  'bin/agent-browser-linux-arm64',
  'bin/agent-browser-linux-musl-x64',
  'bin/agent-browser-linux-musl-arm64',
  'bin/agent-browser-win32-x64.exe',
  'bin/agent-browser-darwin-x64',
  'bin/agent-browser-darwin-arm64',
  'packages/patchright-engine/dist/daemon.js',
  'packages/patchright-engine/dist/install.js',
];
for (const path of required) {
  if (!files.has(path)) throw new Error(`npm package is missing ${path}`);
  if (/^bin\/agent-browser-/.test(path) && pkg.files.find((file) => file.path === path).size < 100000) {
    throw new Error(`Native binary is too small: ${path}`);
  }
}
if (pkg.name !== 'prcli') throw new Error(`Unexpected npm package name: ${pkg.name}`);
const forbidden = pkg.files.find(({ path }) =>
  /^(artifacts|node_modules|cli\/target)\//.test(path) ||
  /(^|\/)\.env($|\.)/.test(path) || path === 'bin/.install-method'
);
if (forbidden) throw new Error(`Unexpected npm package file: ${forbidden.path}`);
console.log(`prcli@${pkg.version}: ${pkg.files.length} files, ${(pkg.size / 1024 / 1024).toFixed(1)} MiB packed`);
