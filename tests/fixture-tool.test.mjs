import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parse, stringify } from 'yaml';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SLUG = '2026-07-20-onboarding-checklist-retention';
const sha = (data) => createHash('sha256').update(data).digest('hex');
const hash = (data) => ({ algorithm: 'sha256', value: sha(data) });
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "aftergrid-review-'"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(ROOT, 'fixtures/instance/analytics'), join(root, 'analytics'), { recursive: true });
  const dir = join(root, 'analytics/findings', SLUG);
  const manifestPath = join(dir, 'manifest.yaml');
  const manifest = parse(readFileSync(manifestPath, 'utf8'));
  const save = () => writeFileSync(manifestPath, stringify(manifest));
  // Independent implementation of the documented digest, for tests of semantic validation after re-pinning.
  const pin = () => {
    for (const group of ['queries', 'checks', 'results']) for (const item of manifest[group]) item.content_hash = hash(readFileSync(join(dir, item.path)));
    for (const ex of manifest.executions) {
      ex.sql_hash = manifest.queries.find(q => q.id === ex.query_id).content_hash;
      ex.result_hash = manifest.results.find(r => r.id === ex.result_id).content_hash;
    }
    const m = structuredClone(manifest);
    delete m.content_digest; delete m.attestations; delete m.reviews; delete m.finding.generated_at; delete m.snapshot.drift_fingerprints;
    for (const ex of m.executions) delete ex.executed_at;
    for (const ck of m.checks) delete ck.executed_at;
    const files = { memo: sha(readFileSync(join(dir, 'memo.md'))) };
    for (const [group, kind, field] of [['queries','query','path'], ['checks','check','path'], ['charts','chart','spec_path'], ['results','result','path']]) {
      for (const item of m[group]) files[kind + ':' + item.id] = sha(readFileSync(join(dir, item[field])));
    }
    manifest.content_digest = hash(canonical({ manifest: m, files }));
    // These tests concern evidence, not an approval source.
    manifest.attestations = []; manifest.reviews = [];
    save();
  };
  const run = (command = 'validate', script = 'fixture-tool.mjs') => spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...(script === 'fixture-tool.mjs' ? [command] : []), dir], { encoding: 'utf8', timeout: 15000 });
  const result = () => JSON.parse(readFileSync(join(dir, manifest.results[0].path), 'utf8'));
  const saveResult = data => writeFileSync(join(dir, manifest.results[0].path), JSON.stringify(data, null, 2) + '\n');
  return { root, dir, manifest, save, pin, run, result, saveResult };
}
function invalid(result, message) {
  assert.notEqual(result.status, 0, message);
  assert.doesNotThrow(() => JSON.parse(result.stdout), 'validation failure must be structured JSON, not a stack trace: ' + result.stderr);
  assert.ok(JSON.parse(result.stdout).errors.length > 0);
}

test('artifact verification clearly reports that it did not execute SQL', t => {
  const f = fixture(t); const r = f.run();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(JSON.parse(r.stdout).executionAvailability, 'artifact_only');
});
test('missing evidence is an actionable validation error', t => {
  const f = fixture(t); rmSync(join(f.dir, f.manifest.results[0].path)); invalid(f.run());
});
test('malformed JSON results produce structured errors', t => {
  const f = fixture(t); writeFileSync(join(f.dir, f.manifest.results[0].path), '{broken'); invalid(f.run());
});
test('duplicate identities are rejected even when hashes are correctly pinned', t => {
  const f = fixture(t); f.manifest.queries.push(structuredClone(f.manifest.queries[0])); f.pin(); invalid(f.run());
});
test('result identity must match its manifest and execution', t => {
  const f = fixture(t); const data = f.result(); data.execution_id = 'other_execution'; f.saveResult(data); f.pin(); invalid(f.run());
});
test('non-numeric decimal strings cannot become valid evidence', t => {
  const f = fixture(t); const data = f.result(); data.rows[0].retained_7d_rate = 'definitely not a number'; f.saveResult(data); f.pin(); invalid(f.run());
});
test('symlinked evidence outside the Finding is rejected', t => {
  const f = fixture(t); const path = join(f.dir, f.manifest.queries[0].path); const outside = join(f.root, 'outside.sql');
  cpSync(path, outside); rmSync(path); symlinkSync(outside, path); invalid(f.run());
});
test('render refuses tampered evidence and preserves the previous output', t => {
  const f = fixture(t); const dest = join(f.dir, 'render/finding.html'); const before = readFileSync(dest, 'utf8');
  const data = f.result(); data.rows[0].retained_7d_rate = '0.99'; f.saveResult(data);
  const r = f.run('', 'fill-reference-html.mjs'); assert.notEqual(r.status, 0); assert.equal(readFileSync(dest, 'utf8'), before);
});
test('render escapes interpolated metadata instead of creating executable markup', t => {
  const f = fixture(t); f.manifest.owner.name = '<img src=x onerror="alert(1)">'; f.pin();
  const r = f.run('', 'fill-reference-html.mjs'); assert.equal(r.status, 0, r.stderr + r.stdout);
  const html = readFileSync(join(f.dir, 'render/finding.html'), 'utf8');
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'));
});
test('generic metadata tokens cannot bypass the evidence export policy', t => {
  const f = fixture(t); const tpl = join(f.dir, 'render/finding.template.html');
  writeFileSync(tpl, readFileSync(tpl, 'utf8') + '\n{{meta:external_sources.0.value}}');
  assert.notEqual(f.run('', 'fill-reference-html.mjs').status, 0);
});
test('rebuilding changed content never rebinds prior reviews or approvals', t => {
  const f = fixture(t); const old = structuredClone({reviews:f.manifest.reviews, attestations:f.manifest.attestations, definitions:f.manifest.definitions.map(d=>d.approval)});
  const memo = join(f.dir, 'memo.md'); writeFileSync(memo, readFileSync(memo, 'utf8') + '\nA changed appendix.\n');
  const r = f.run('build'); assert.equal(r.status, 0, r.stderr + r.stdout);
  const after = parse(readFileSync(join(f.dir, 'manifest.yaml'), 'utf8'));
  assert.deepEqual({reviews:after.reviews, attestations:after.attestations, definitions:after.definitions.map(d=>d.approval)}, old);
});
test('a malformed Check is an error, never a pass or intentional abstention', t => {
  const f = fixture(t); writeFileSync(join(f.dir, f.manifest.checks[0].path), 'select true as pass union all select false as pass');
  const r = f.run('build');
  assert.notEqual(r.status, 0, 'build must fail on a malformed two-row Check');
});
test('SQL cannot read undeclared local files', t => {
  const f = fixture(t); const sentinel = join(f.root, 'review-sentinel.txt'); writeFileSync(sentinel, 'only disposable test content');
  const literal = "'" + sentinel.replaceAll("'", "''") + "'";
  writeFileSync(join(f.dir, f.manifest.queries[0].path), `select 'checklist' as arm, 1 as signups, 1 as retained, '1' as retained_7d_rate from read_text(${literal})`);
  const r = f.run('build'); assert.notEqual(r.status, 0, 'undeclared file read must be denied');
  assert.match(r.stderr + r.stdout, /external|disabled|access|permission/i);
});
