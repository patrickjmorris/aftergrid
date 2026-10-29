// Checks that the saved results, the deck, the site page, and the skill outputs agree.
// Reads only files in this repository. Does not need the private extract.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendix, slides } from './content.mjs';
import { change } from './numbers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = join(root, 'analysis', 'results');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const manifest = JSON.parse(readFileSync(join(root, 'analysis', 'results_manifest.json'), 'utf8'));
const files = readdirSync(results).filter((f) => f.endsWith('.csv')).sort();
check(JSON.stringify(files) === JSON.stringify(Object.keys(manifest).sort()), 'analysis/results/ and results_manifest.json list different files');
for (const f of files) check(createHash('sha256').update(readFileSync(join(results, f))).digest('hex') === manifest[f], `${f} does not match its manifest hash`);

try {
  execFileSync(process.execPath, [join(root, 'scripts', 'build-page.mjs'), '--check'], { stdio: 'pipe' });
} catch {
  failures.push('docs/examples/spotsports-youtube.md is out of date with scripts/content.mjs');
}

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const flat = unescape(readFileSync(join(root, 'deck', 'spotsports-youtube-case-study.html'), 'utf8').replace(/<[^>]+>/g, ''));
let pdf = null;
try { pdf = execFileSync('pdftotext', [join(root, 'deck', 'spotsports-youtube-case-study.pdf'), '-'], { maxBuffer: 64 * 1024 * 1024 }).toString().replace(/\s+/g, ' '); } catch { console.warn('pdftotext unavailable: PDF text not checked'); }
const strings = (s) => [s.title, s.lead, s.tempting, ...(s.points || []), ...(s.facts || []).flat(), s.chart?.caption,
  ...(s.stats || []).flatMap((t) => [t.value, t.label, t.sub]), ...(s.cards || []).flatMap((c) => [c.stat, c.label, c.body]),
  ...(s.table?.rows || []).flat(), ...(s.asks || []).flat(), ...(s.offers || []).flat(), ...(s.split ? [s.split.keptLabel, s.split.addedLabel] : []), ...(s.triggers || []).flatMap((t) => [t.when, t.what]), ...(s.steps || []).flatMap(([a, b]) => [a, b])].filter(Boolean);
check(!/\bNaN\b|\bundefined\b/.test(flat), 'deck text contains NaN or undefined');
check(slides.length === 10, `the deck has ${slides.length} main slides, not 10`);
for (const s of slides) {
  for (const t of strings(s)) check(flat.includes(t), `deck is missing text from slide "${s.id}": ${t.slice(0, 70)}`);
  for (const v of s.chart?.values || []) check(flat.includes(change(v)), `deck chart on "${s.id}" is missing ${change(v)}`);
  for (const sr of s.chart?.series || []) for (const v of sr.values) check(Number.isFinite(v) && (s.chart.kind !== 'pairs' || flat.includes(change(v))), `deck chart on "${s.id}" is missing or has a bad value ${v}`);
  const bare = (t) => t.replace(/[-\u2010\u2011]/g, '').replace(/\s+/g, ' ');
  if (pdf) check(bare(pdf).includes(bare(s.title)), `PDF is missing slide title "${s.title.slice(0, 50)}"; rebuild it`);
}
for (const t of appendix) {
  if (t.divider) continue;
  check(flat.includes(t.title), `deck appendix is missing page ${t.title}`);
  if (t.chart) for (const sr of t.chart.series || [{ values: t.chart.values }]) for (const v of sr.values) check(Number.isFinite(v), `deck appendix ${t.title} has a bad value ${v}`);
  else for (const row of t.rows) for (const c of row) check(flat.includes(String(c)), `deck appendix ${t.title} is missing ${c}`);
}

const cells = new Set();
for (const f of files) {
  for (const cell of readFileSync(join(results, f), 'utf8').split(/[\r\n,]/)) {
    const v = Number(cell);
    if (cell !== '' && Number.isFinite(v)) { cells.add(v); cells.add(Math.round(v)); }
  }
}
for (const f of readdirSync(join(root, 'analysis', 'skill-outputs'))) {
  const text = readFileSync(join(root, 'analysis', 'skill-outputs', f), 'utf8').replace(/\([^)]*\.(csv|py|md|sql)\)/g, '');
  for (const token of text.match(/\b\d+\.\d{4}\b/g) || []) check(cells.has(Number(token)), `${f} cites ${token}, which is not a cell in analysis/results/`);
}

if (failures.length) {
  console.error(failures.map((f) => `FAIL ${f}`).join('\n'));
  process.exit(1);
}
console.log(`ok: ${files.length} results match their hashes; deck, PDF, page, and skill outputs agree with them`);
