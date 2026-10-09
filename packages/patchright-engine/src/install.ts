import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const cli = path.join(path.dirname(require.resolve('patchright/package.json')), 'cli.js');
const args = process.argv.slice(2);
if (!args.some((arg) => !arg.startsWith('-'))) args.push('chromium');
const result = spawnSync(process.execPath, [cli, 'install', ...args], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
