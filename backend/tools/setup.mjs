import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const backend=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const project=resolve(backend,'..');
process.chdir(project);
for (const directory of ['backend', 'frontend']) {
  const target = directory === 'backend' ? 'backend/.env' : 'frontend/.env.local';
  if (!existsSync(target)) {
    copyFileSync(`${directory}/.env.example`, target);
    if (directory === 'backend')
      writeFileSync(
        target,
        readFileSync(target, 'utf8')
          .replace('replace-with-at-least-32-random-characters', randomBytes(48).toString('hex'))
          .replace('replace-with-a-separate-long-random-secret', randomBytes(48).toString('hex')),
      );
  }
}
function run(command, args,cwd=backend) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    windowsHide:true,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis']);
const npm=process.env.npm_execpath;
if(!npm)throw new Error('Start setup using npm run setup from backend.');
run(process.execPath,[npm,'ci'],resolve(project,'frontend'));
run(process.execPath,[npm,'run','db:generate']);
run(process.execPath,[npm,'run','db:migrate']);
run(process.execPath,[npm,'run','db:seed']);
console.log('\nReady. From backend run npm run dev:all; open http://localhost:3000.');
