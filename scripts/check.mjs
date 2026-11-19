import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const files = ['server.mjs', 'scripts/check.mjs', 'scripts/build.mjs'];
for (const folder of ['src', 'tests']) {
  for (const file of await readdir(folder)) if (file.endsWith('.js')) files.push(`${folder}/${file}`);
}
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
