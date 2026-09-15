// Trusted, hand-authored HTML reference templates only; this is not the production renderer.
// Verify the evidence first, then interpolate exported values as escaped text/quoted attributes.
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse as parseYaml } from 'yaml';
import { safePath, calculate, formatValue, escapeHtml, fail } from './fixture-safety.mjs';

function render(dir) {
  const verified = spawnSync(process.execPath, [fileURLToPath(new URL('./fixture-tool.mjs', import.meta.url)), 'validate', dir], { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (verified.status !== 0) throw new Error('Evidence validation failed; no HTML was written.\n' + (verified.stdout || verified.stderr || verified.error?.message));
  const report = JSON.parse(verified.stdout);
  const manifest = parseYaml(readFileSync(safePath(dir, 'manifest.yaml'), 'utf8'));
  const results = new Map(manifest.results.map(r => [r.id, JSON.parse(readFileSync(safePath(dir, r.path), 'utf8'))]));
  const allowed = new Set(manifest.export_policy.allowed_fields);
  function resolveRef(ref, seen = new Set()) {
    let m;
    if ((m = /^ref:([a-z][a-z0-9_]{0,63})\.([A-Za-z0-9_-]{1,64})\.([a-z][a-z0-9_]{0,63})$/.exec(ref))) {
      const [,rid,rk,col] = m;
      if (!allowed.has(`${rid}.${col}`)) fail('export_policy', ref, 'column not allowed for export');
      const res = manifest.results.find(r => r.id === rid), data = results.get(rid);
      const c = res?.columns.find(c => c.name === col);
      if (!res || !data || !c) fail('unresolved_reference', ref, 'result or column is not declared');
      if (res.provisional) fail('provisional_evidence', ref, 'provisional results cannot reach a Reader');
      const rows = data.rows.filter(r => String(r[res.row_key]) === rk);
      if (rows.length !== 1) fail('unresolved_reference', ref, 'expected exactly one matching row');
      return { value: rows[0][col], unit: c.unit, display: c.display };
    }
    if ((m = /^derived:([a-z][a-z0-9_]{0,63})$/.exec(ref))) {
      if (seen.has(m[1])) fail('derived_cycle', ref, 'cyclic derived value');
      const d = manifest.derived.find(d => d.id === m[1]);
      if (!d) fail('unresolved_reference', ref, 'unknown derived value');
      const ops = d.operands.map(o => resolveRef(o, new Set([...seen, m[1]])));
      const exact = calculate(d.operation, ops, d.unit);
      return { value: exact === null ? null : 'derived', exact, unit: d.unit, display: d.display };
    }
    if ((m = /^ext:([a-z][a-z0-9_]{0,63})$/.exec(ref))) {
      const e = manifest.external_sources.find(e => e.id === m[1]);
      if (!e) fail('unresolved_reference', ref, 'unknown external source');
      return { value: e.value, unit: e.unit, display: e.display };
    }
    fail('unresolved_reference', ref, 'malformed value reference');
  }
  function meta(path) {
    // An arbitrary object-path escape hatch would bypass both provenance and export rules.
    if (!/^(?:finding\.(?:id|revision|generated_at|canonical_location)|owner\.(?:name|contact)|coverage\.(?:description|data_from|data_to)|definitions\.\d+\.(?:id|version|lifecycle|approval\.(?:approver|date)))$/.test(path)) fail('metadata_policy', path, 'not a supported metadata token');
    const v = path.split('.').reduce((o,k) => o != null && Object.hasOwn(o,k) ? o[k] : undefined, manifest);
    if (!['string','number','boolean'].includes(typeof v)) fail('unresolved_reference', path, 'metadata must resolve to a scalar');
    return v;
  }
  let tpl = readFileSync(safePath(dir, 'render/finding.template.html'), 'utf8');
  // Mail addresses in a URL need URI encoding as well as HTML encoding. Text copies stay readable.
  tpl = tpl.replace(/href="mailto:\{\{meta:owner\.contact\}\}/g, 'href="mailto:' + escapeHtml(encodeURIComponent(meta('owner.contact'))));
  let out = tpl.replace(/\{\{(ref|derived|ext|meta|literal):([^}]*)\}\}/g, (_,kind,body) => {
    const value = kind === 'meta' ? meta(body) : kind === 'literal' ? body : formatValue(resolveRef(kind + ':' + body));
    return escapeHtml(value);
  });
  if (report.warnings?.some(w => w.category === 'stale_review')) {
    out = out.replace('</body>', '<p class="draft" role="status">An earlier review applies to a previous version of this draft. The current version needs review.</p>\n</body>');
  }
  if (manifest.export_policy.private_marker && out.includes(manifest.export_policy.private_marker)) fail('export_policy', 'render', 'private marker present in output');
  if (/\{\{/.test(out)) fail('unresolved_reference', 'render', 'unfilled token remains');
  const dest = safePath(dir, 'render/finding.html');
  const temp = safePath(dir, `render/finding-${process.pid}.tmp`);
  try { writeFileSync(temp, out, { flag: 'wx' }); renameSync(temp, dest); }
  finally { rmSync(temp, { force: true }); }
  console.log('wrote render/finding.html (' + Buffer.byteLength(out) + ' bytes)');
}
try {
  if (!process.argv[2]) throw new Error('usage: fill-reference-html.mjs <finding-dir>');
  render(resolve(process.argv[2]));
} catch (e) { console.error(e.message); process.exitCode = 1; }
