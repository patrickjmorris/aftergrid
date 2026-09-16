import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse, stringify } from 'yaml';
import { render } from './commands/render.ts';
import { digestOf } from '../scripts/lib/validate-finding.mjs';

const NUMERIC = '2026-07-20-onboarding-checklist-retention';
function fixture(t: any) {
  const root = mkdtempSync(join(tmpdir(), 'ag-render-security-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(fileURLToPath(new URL('../fixtures/instance/', import.meta.url)), root, { recursive: true });
  const dir = join(root, 'analytics/findings', NUMERIC);
  const mp = join(dir, 'manifest.yaml');
  const m = parse(readFileSync(mp, 'utf8'));
  const pin = () => {
    m.reviews = []; m.attestations = [];
    rmSync(join(root, 'analytics/decisions'), { recursive: true, force: true });
    m.content_digest = digestOf(m, dir);
    writeFileSync(mp, stringify(m, { lineWidth: 0 }));
  };
  return { root, dir, m, pin };
}

test('renderer escapes authored claim text and exported text cells as data', async (t) => {
  const { dir, m, pin } = fixture(t);
  const payload = '<img src=x onerror=alert(document.domain)>';
  m.claims[0].population += payload;
  const r = m.results[0];
  r.columns.push({ name: 'label', type: 'text', unit: 'text' });
  m.export_policy.allowed_fields.push(`${r.id}.label`);
  m.tables.push({ id: 'labels', claim_id: m.claims[0].id, result_id: r.id, title: 'Labels', columns: [{ name: 'label', label: 'Label' }] });
  const data = JSON.parse(readFileSync(join(dir, r.path), 'utf8'));
  data.columns.push('label'); for (const row of data.rows) row.label = payload;
  writeFileSync(join(dir, r.path), JSON.stringify(data));
  r.content_hash.value = createHash('sha256').update(readFileSync(join(dir, r.path))).digest('hex');
  m.executions.find((e: any) => e.result_id === r.id).result_hash.value = r.content_hash.value;
  m.claims[0].table_ids.push('labels');
  const memo = join(dir, 'memo.md');
  writeFileSync(memo, readFileSync(memo, 'utf8').replace('<!-- chart: retention_by_arm_chart -->', '<!-- chart: retention_by_arm_chart -->\n\n<!-- table: labels -->'));
  pin();
  const report = await render({ dir });
  assert.deepEqual(report.errors, []);
  const html = readFileSync(join(dir, 'render/finding.html'), 'utf8');
  assert.ok(!html.includes(payload), 'text must never become an HTML element');
  assert.ok(html.includes('&lt;img src=x onerror=alert(document.domain)&gt;'));
});

test('resolved values cannot introduce Markdown links or figure markers', async (t) => {
  const { dir, pin } = fixture(t);
  const memo = join(dir, 'memo.md');
  writeFileSync(memo, readFileSync(memo, 'utf8') + '\n{{literal:[untrusted](https://attacker.example/collect)}}\n');
  writeFileSync(memo, readFileSync(memo, 'utf8').replace('<!-- chart: retention_by_arm_chart -->', '<!-- chart: retention_by_arm_chart -->\n\n{{literal:<!-- chart: retention_by_arm_chart -->}}'));
  pin();
  const r = await render({ dir }); assert.deepEqual(r.errors, []);
  const html = readFileSync(join(dir, 'render/finding.html'), 'utf8');
  assert.equal((html.match(/<svg/g) ?? []).length, 1, 'a token cannot manufacture a chart marker');
  assert.ok(!html.includes('href="https://attacker.example'), 'token content is text, not authored Markdown');
});

test('renderer cannot overwrite any declared evidence path', async (t) => {
  const { dir, m, pin } = fixture(t);
  const q = m.queries[0];
  const sql = readFileSync(join(dir, q.path), 'utf8');
  q.path = 'render/finding.html'; writeFileSync(join(dir, q.path), sql); pin();
  const r = await render({ dir });
  assert.ok(r.errors.some(e => e.category === 'path_collision'), JSON.stringify(r));
  assert.equal(readFileSync(join(dir, q.path), 'utf8'), sql);
});

test('all output paths are checked before changing any previous output', async (t) => {
  const { root, dir } = fixture(t);
  const html = join(dir, 'render/finding.html'); writeFileSync(html, 'previous output');
  const outside = join(root, 'outside.svg'); writeFileSync(outside, 'untouched');
  const svg = join(dir, 'render/retention_by_arm_chart.svg'); rmSync(svg, { force: true }); symlinkSync(outside, svg);
  const r = await render({ dir });
  assert.ok(r.errors.some(e => e.category === 'unsafe_path'), JSON.stringify(r));
  assert.equal(readFileSync(html, 'utf8'), 'previous output');
  assert.equal(readFileSync(outside, 'utf8'), 'untouched');
});

test('renderer reports pinned version mismatches without silently repinning evidence', async (t) => {
  const { dir, m, pin } = fixture(t); m.renderer.version = 'unsupported-renderer'; pin();
  const r = await render({ dir });
  assert.ok([...r.warnings, ...r.errors].some(e => /version|renderer/i.test(e.message)), JSON.stringify(r));
  assert.equal(parse(readFileSync(join(dir, 'manifest.yaml'), 'utf8')).renderer.version, 'unsupported-renderer');
});

test('draft banner distinguishes unavailable publication verification from absence of review', async (t) => {
  const { dir } = fixture(t);
  const r = await render({ dir }); assert.deepEqual(r.errors, []);
  const html = readFileSync(join(dir, 'render/finding.html'), 'utf8');
  assert.ok(!html.includes('the conclusion is not yet reviewed by a person'), 'recorded method review exists');
});

test('render enforces the same Decision bindings as check before writing', async (t) => {
  const { root, dir } = fixture(t);
  const dp = join(root, 'analytics/decisions/dec_2x7v4b9m1kqa.yaml');
  const d = parse(readFileSync(dp, 'utf8')); d.finding.content_digest.value = 'a'.repeat(64);
  writeFileSync(dp, stringify(d));
  const out = join(dir, 'render/finding.html'); writeFileSync(out, 'previous output');
  const r = await render({ dir });
  assert.ok(r.errors.some(e => e.category === 'decision_binding'), JSON.stringify(r));
  assert.equal(readFileSync(out, 'utf8'), 'previous output');
});

test('successful render removes obsolete chart exports but preserves authored templates', async (t) => {
  const { dir } = fixture(t);
  writeFileSync(join(dir, 'render/old-private-chart.svg'), '<svg>previously exported private data</svg>');
  writeFileSync(join(dir, 'render/old-private-chart.png'), 'old preview');
  const templatePath = join(dir, 'render/finding.template.html');
  const template = readFileSync(templatePath, 'utf8');
  const r = await render({ dir }); assert.deepEqual(r.errors, []);
  const { existsSync } = await import('node:fs');
  assert.ok(!existsSync(join(dir, 'render/old-private-chart.svg')));
  assert.ok(!existsSync(join(dir, 'render/old-private-chart.png')));
  assert.equal(readFileSync(templatePath, 'utf8'), template);
});

test('chart rendering refuses exact decimals outside the finite chart range', async (t) => {
  const { dir, m } = fixture(t);
  const { renderChartSvg } = await import('./render/charts.ts');
  const ch = m.charts[0];
  const results: any = {};
  for (const r of m.results) results[r.id] = JSON.parse(readFileSync(join(dir, r.path), 'utf8'));
  for (const value of ['1e999', '1e-999']) {
    results[ch.result_id].rows[0].retained_7d_rate = value;
    await assert.rejects(() => renderChartSvg(m, results, { ...ch, __specPath: join(dir, ch.spec_path) }, 'Out of range'), /finite numeric range/);
  }
});


test('a replacement error restores every previous output', async (t) => {
  const { root, dir, m } = fixture(t);
  const { writeOutputs } = await import('./render/outputs.ts');
  const { default: fs } = await import('node:fs');
  const { syncBuiltinESMExports } = await import('node:module');
  const html = join(dir, 'render/finding.html'), svg = join(dir, 'render/retention_by_arm_chart.svg');
  writeFileSync(html, 'previous HTML'); writeFileSync(svg, 'previous SVG');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from: any, to: any) => {
    if (String(from).endsWith('/new-1')) throw new Error('injected replacement failure');
    return rename(from, to);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => writeOutputs(dir, m, [['render/finding.html', Buffer.from('new HTML')], ['render/retention_by_arm_chart.svg', Buffer.from('new SVG')]], join(root, 'analytics')), /injected replacement failure/);
    assert.equal(readFileSync(html, 'utf8'), 'previous HTML');
    assert.equal(readFileSync(svg, 'utf8'), 'previous SVG');
    assert.ok(!fs.readdirSync(dir).some(name => name.startsWith('.render-stage-')));
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});


test('SVG paint cannot introduce external resources into a self-contained export', async (t) => {
  const { dir, m, pin } = fixture(t);
  const specPath = join(dir, m.charts[0].spec_path);
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  delete spec.encoding.color;
  spec.mark.fill = 'url(https://attacker.invalid/resource)';
  writeFileSync(specPath, JSON.stringify(spec)); pin();
  const out = join(dir, 'render/finding.html'); writeFileSync(out, 'previous output');
  const r = await render({ dir });
  assert.ok(r.errors.some(e => e.category === 'chart_subset' && /external SVG/.test(e.message)), JSON.stringify(r));
  assert.equal(readFileSync(out, 'utf8'), 'previous output');
});
