import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis']);
run('npm', ['run', 'db:generate']);
run('npm', ['run', 'db:migrate']);
run('npm', ['run', 'db:seed']);
console.log('\nEverything is ready. Run npm run dev, then open http://localhost:3000.');
