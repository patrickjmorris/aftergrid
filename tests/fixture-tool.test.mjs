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
function fixture(t, prefix = 'aftergrid-review-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
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
  const f = fixture(t); f.pin(); const r = f.run();
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
  assert.match(r.stderr + r.stdout, /exactly one row|check_shape/i);
});
test('SQL loading works in project paths containing an apostrophe', t => {
  const f = fixture(t, "aftergrid-review-'"); const r = f.run('build');
  assert.equal(r.status, 0, r.stderr + r.stdout);
});
test('SQL cannot read undeclared local files', t => {
  const f = fixture(t); const sentinel = join(f.root, 'review-sentinel.txt'); writeFileSync(sentinel, 'only disposable test content');
  const literal = "'" + sentinel.replaceAll("'", "''") + "'";
  writeFileSync(join(f.dir, f.manifest.queries[0].path), `select 'checklist' as arm, 1 as signups, 1 as retained, '1' as retained_7d_rate from read_text(${literal})`);
  const r = f.run('build'); assert.notEqual(r.status, 0, 'undeclared file read must be denied');
  assert.match(r.stderr + r.stdout, /external|disabled|access|permission/i);
});

test('typed boolean result cannot be substituted with a string', t => {
  const f = fixture(t); const col = f.manifest.results[0].columns.find(c=>c.name==='retained_7d_rate'); col.type='boolean'; f.pin(); invalid(f.run());
});
test('unknown nested chart fields and encoding transformations are rejected', t => {
  const f = fixture(t); const path=join(f.dir,f.manifest.charts[0].spec_path);const spec=JSON.parse(readFileSync(path,'utf8'));
  spec.encoding.tooltip=[{field:'made_up',aggregate:'sum',type:'quantitative'}];
  writeFileSync(path,JSON.stringify(spec));f.pin();invalid(f.run());
});
test('a displayed derived value cannot launder a field excluded from export', t => {
  const f=fixture(t); f.manifest.export_policy.allowed_fields=f.manifest.export_policy.allowed_fields.filter(x=>x!=='retention_by_arm.signups');
  f.manifest.tables[0].columns=f.manifest.tables[0].columns.filter(c=>c.name!=='signups');
  f.pin();invalid(f.run());
});
test('optional SQL errors are not valid insufficient-data outcomes', t => {
  const f=fixture(t); f.manifest.checks[0].required=false;f.manifest.checks[0].outcome='error';f.pin();invalid(f.run());
});
test('a draft with corrupted evidence is invalid rather than merely incomplete', t => {
  const f=fixture(t);f.manifest.finding.state='draft';f.manifest.finding.outcome='pending';f.pin();
  const data=f.result();data.rows[0].retained_7d_rate='0.9';f.saveResult(data);
  const r=f.run();invalid(r);assert.equal(JSON.parse(r.stdout).evidence,'invalid');
});
test('rebuild fails without replacing results if a later Check is malformed', t => {
  const f=fixture(t);const resultPath=join(f.dir,f.manifest.results[0].path);const before=readFileSync(resultPath,'utf8');
  writeFileSync(join(f.dir,f.manifest.queries[0].path),"select 'checklist' as arm, 1 as signups, 1 as retained, '0.5' as retained_7d_rate");
  writeFileSync(join(f.dir,f.manifest.checks.at(-1).path),'select 1 as pass');
  assert.notEqual(f.run('build').status,0);assert.equal(readFileSync(resultPath,'utf8'),before);
});
test('named parameters mentioned only in a comment are not bound', t => {
  const f=fixture(t);f.manifest.executions[0].parameters.unused=7;f.save();const query=join(f.dir,f.manifest.queries[0].path);
  writeFileSync(query,readFileSync(query,'utf8')+'\n-- This comment mentions $unused but SQL does not use it.\n');
  const r=f.run('build');assert.equal(r.status,0,r.stderr+r.stdout);
});
test('write statements cannot change the fixture database', t => {
  const f=fixture(t);writeFileSync(join(f.dir,f.manifest.queries[0].path),'delete from users returning user_id');
  const r=f.run('build');assert.notEqual(r.status,0);assert.match(r.stderr,/only SELECT/);
});
test('multiple statements cannot hide work before the reported result', t => {
  const f=fixture(t);const path=join(f.dir,f.manifest.queries[0].path);writeFileSync(path,'select 1; '+readFileSync(path,'utf8'));
  const r=f.run('build');assert.notEqual(r.status,0);assert.match(r.stderr,/exactly one SELECT/);
});
test('derived cycles are rejected without crashing the renderer', t => {
  const f=fixture(t);f.manifest.derived[0].operands=['derived:'+f.manifest.derived[0].id,'derived:'+f.manifest.derived[0].id];f.pin();
  invalid(f.run());const r=f.run('','fill-reference-html.mjs');assert.notEqual(r.status,0);assert.doesNotMatch(r.stderr,/Maximum call stack/);
});
test('unsupported numeric operands are rejected before NaN can reach a Reader', t => {
  const f=fixture(t);f.manifest.derived[0].operation='ratio';f.manifest.derived[0].unit='ratio';f.manifest.derived[0].operands=[f.manifest.derived[0].operands[0]];f.pin();invalid(f.run());
});
test('integers outside the safe JSON range are refused instead of rounded', t => {
  const f=fixture(t);writeFileSync(join(f.dir,f.manifest.queries[0].path),"select 'checklist' as arm, 9007199254740993::bigint as signups, 1 as retained, '1' as retained_7d_rate");
  const r=f.run('build');assert.notEqual(r.status,0);assert.match(r.stderr,/safe JSON integer/);
});
test('a query cannot read a retained table omitted from its execution record', t=>{
  const f=fixture(t);f.manifest.executions[0].input_ids=['users'];f.save();
  const r=f.run('build');assert.notEqual(r.status,0);assert.match(r.stderr,/events.*does not exist/i);
});
test('render identifies a review of an older digest as stale', t=>{
  const f=fixture(t);f.manifest.attestations=[];f.save();const memo=join(f.dir,'memo.md');writeFileSync(memo,readFileSync(memo,'utf8')+'\nA new appendix note.\n');
  const build=f.run('build');assert.equal(build.status,0,build.stderr);
  const render=f.run('','fill-reference-html.mjs');assert.equal(render.status,0,render.stderr);
  assert.match(readFileSync(join(f.dir,'render/finding.html'),'utf8'),/current version needs review/);
});
test('changing a definition does not silently renew its approval', t=>{
  const f=fixture(t);const def=f.manifest.definitions[0];const old=structuredClone(def.approval);
  const file=join(f.root,'analytics',def.path);writeFileSync(file,readFileSync(file,'utf8')+'\nA changed definition.\n');
  const r=f.run('build');assert.equal(r.status,0,r.stderr);
  const current=parse(readFileSync(join(f.dir,'manifest.yaml'),'utf8')).definitions[0];
  assert.deepEqual(current.approval,old);assert.notEqual(current.content_hash.value,old.content_hash.value);
  invalid(f.run());
});
