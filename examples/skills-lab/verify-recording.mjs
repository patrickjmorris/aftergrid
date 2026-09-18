// Reproduce recorded calculations. This does not rerun the AI agent.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const verified = [];
for (const name of ['conversion', 'revenue', 'review', 'learning']) {
  const actual = JSON.parse(execFileSync('python3', [`outputs/${name}/calculate.py`], { cwd: root, encoding: 'utf8' }));
  const recorded = JSON.parse(readFileSync(new URL(`outputs/${name}/stdout.json`, import.meta.url), 'utf8'));
  assert.deepEqual(actual, recorded, `${name}: calculation differs from recorded stdout`);
  verified.push(name);
}
const artifacts = JSON.parse(execFileSync('python3', ['outputs/verify_artifacts.py'], { cwd: root, encoding: 'utf8' }));
console.log(JSON.stringify({ verified_calculations: verified, artifacts, scope: 'Calculation reruns and artifact integrity; not new model runs.' }, null, 2));
