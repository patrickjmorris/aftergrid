// Writes docs/examples/spotsports-youtube.md from content.mjs, the same source as the deck.
// `--check` fails instead of writing when the page is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendix, meta, slides } from './content.mjs';
import { change } from './numbers.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const out = join(repo, 'docs', 'examples', 'spotsports-youtube.md');
const GH = 'https://github.com/patrickjmorris/aftergrid/blob/main/examples/spotsports-youtube';

const cell = (v) => String(v).replace(/\|/g, '\\|');
const table = (head, rows) => [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const fmt = (v) => change(v);

function section(s, i) {
  const parts = [`## ${i + 1}. ${s.title}`];
  if (s.split) parts.push(`- **${s.split.kept}** ${s.split.keptLabel}\n- **${s.split.added}** ${s.split.addedLabel}`);
  if (s.stats) parts.push(s.stats.map((t) => `- **${t.value}** ${t.label}. ${t.sub}.`).join('\n'));
  if (s.facts) parts.push(s.facts.map(([k, v]) => `- **${k}:** ${v}`).join('\n'));
  if (s.lead) parts.push(s.lead);
  if (s.points) parts.push(s.points.map((p) => `- ${p}`).join('\n'));
  if (s.asks) parts.push(s.asks.map(([t, d], j) => `${j + 1}. **${t}.** ${d}`).join('\n'));
  if (s.tempting) parts.push(`**${s.temptingLabel || 'The tempting read'}:** ${s.tempting}`);
  if (s.chart?.kind === 'line') parts.push(table(['Publish week', s.chart.series[0].name], s.chart.labels.map((l, j) => [l, fmt(s.chart.series[0].values[j])])));
  else if (s.chart?.kind === 'pairs') parts.push(table(['Group', ...s.chart.series.map((x) => x.name)], s.chart.labels.map((l, j) => [l, ...s.chart.series.map((x) => change(x.values[j]))])));
  else if (s.chart) parts.push(table(['Comparison', 'After ÷ before'], s.chart.labels.map((l, j) => (s.chart.highlight?.[j] ? [`**${l}**`, `**${fmt(s.chart.values[j])}**`] : [l, fmt(s.chart.values[j])]))));
  if (s.chart) parts.push(`${s.chart.caption} Source: \`${s.chart.source}\`.`);
  if (s.cards) parts.push(s.cards.map((c) => `- **${c.stat}** ${c.label}. ${c.body}`).join('\n'));
  if (s.table) parts.push(table(s.table.head, s.table.rows));
  if (s.triggers) parts.push(s.triggers.map((t) => `- **${t.when}.** ${t.what}`).join('\n'));
  if (s.offers) parts.push(s.offers.map(([t, d], j) => `${j + 1}. **${t}.** ${d}`).join('\n'));
  if (s.steps) parts.push(s.steps.map(([skill, what, url], j) => `${j + 1}. [\`${skill}\`](${url}): ${what}.`).join('\n'));
  if (s.links) parts.push(s.links.map(([label, url]) => `[${label}](${url})`).join(' · '));
  return parts.join('\n\n');
}

const chartTable = (c) => {
  const f = c.format === 'share' ? (v) => `${Math.round(v * 100)}%` : change;
  if (c.kind === 'line' || c.kind === 'pairs') return table([c.kind === 'line' ? 'Publish week' : 'Group', ...c.series.map((x) => x.name)], c.labels.map((l, j) => [l, ...c.series.map((x) => f(x.values[j]))]));
  return table(['Group', 'After ÷ before'], c.labels.map((l, j) => [l, f(c.values[j])]));
};
const tables = appendix.map((t) => t.divider ? `## Appendix: ${t.divider.toLowerCase()}` : [`### ${t.title}`, ...(t.lead ? [t.lead] : []), t.chart ? chartTable(t.chart) : table(t.head, t.rows), `${t.note ? `${t.note} ` : ''}Source: \`${t.source}\`.`].join('\n\n'));

const page = `---
title: ${JSON.stringify(meta.title)}
description: ${JSON.stringify(meta.description)}
kicker: ${JSON.stringify(meta.kicker)}
---

An analysis on real data: the public view counts of about 900 sports creator channels, from Spot Sports' catalog. The owner approved publishing these metrics. Nothing here identifies a viewer. The analysis is agent-made and AI-reviewed, not human-approved. [How it was built](spotsports-youtube-how-it-was-built.md).

This page and the [deck](${GH}/deck/spotsports-youtube-case-study.pdf) are generated from the same source. Every number traces to a [saved result](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/results).

${slides.map(section).join('\n\n')}

## Appendix: sport and channel detail

${tables.join('\n\n')}
`;

if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== page) {
    console.error(`${out} is out of date. Run node examples/spotsports-youtube/scripts/build-page.mjs`);
    process.exit(1);
  }
  console.log('page up to date');
} else {
  writeFileSync(out, page);
  console.log(out);
}
