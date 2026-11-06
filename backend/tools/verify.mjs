import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm run verify from backend.');
function run(cwd, script) {
  const result = spawnSync(process.execPath, [npm, 'run', script], {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
for (const cwd of [backend, resolve(backend, '../frontend')]) {
  run(cwd, 'typecheck');
  run(cwd, 'build');
}
run(backend, 'test');
if (process.argv.includes('--integration')) run(backend, 'test:integration');
if (process.argv.includes('--browser')) run(resolve(backend, '../frontend'), 'test:e2e');
