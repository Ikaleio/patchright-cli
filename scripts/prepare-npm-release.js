#!/usr/bin/env node

// Each workflow run gets a new patch version without committing generated versions.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const runNumber = process.env.GITHUB_RUN_NUMBER;
const base = pkg.version.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (pkg.name !== '@ikaleio/prcli' || !base || !/^[1-9]\d*$/.test(runNumber || '')) {
  throw new Error('Expected @ikaleio/prcli, a stable source version, and a positive GITHUB_RUN_NUMBER.');
}
const patch = Number(base[3]) + Number(runNumber);
if (!Number.isSafeInteger(patch)) throw new Error('Release patch version is too large.');
const version = `${base[1]}.${base[2]}.${patch}`;

const cargoPath = join(root, 'cli/Cargo.toml');
const lockPath = join(root, 'cli/Cargo.lock');
const cargo = readFileSync(cargoPath, 'utf8');
const lock = readFileSync(lockPath, 'utf8');
const lockPattern = /(\[\[package\]\]\nname = "agent-browser"\nversion = ")[^"]+("\n)/;
if (!lockPattern.test(lock)) throw new Error('Cannot find the CLI package in Cargo.lock.');
pkg.version = version;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(cargoPath, cargo.replace(/^version = "[^"]+"/m, `version = "${version}"`));
writeFileSync(lockPath, lock.replace(lockPattern, (_, before, after) => `${before}${version}${after}`));
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`, { flag: 'a' });
}
console.log(`Prepared ${pkg.name}@${version}`);
