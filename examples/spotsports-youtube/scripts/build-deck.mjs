// Builds deck/spotsports-youtube-case-study.html from content.mjs, then prints it to
// deck/spotsports-youtube-case-study.pdf with headless Chrome. No dependencies.
// Set CHROME to a Chrome or Chromium binary when it is not at the macOS default path. --html-only skips the PDF.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appendix, meta, slides } from './content.mjs';
import { change } from './numbers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'deck', 'spotsports-youtube-case-study.html');
const pdfPath = join(root, 'deck', 'spotsports-youtube-case-study.pdf');

const C = { ink: '#15202B', ink2: '#2B3A4A', muted: '#5B6670', grid: '#E3E6EA', paper: '#F1F3F5', orange: '#D9480F', blue: '#2F6FA8', gray: '#A9B4BE', white: '#FFFFFF' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

function refLine(y, x1, x2, label) {
  return `<line x1="${x1}" x2="${x2}" y1="${r1(y)}" y2="${r1(y)}" stroke="${C.orange}" stroke-dasharray="5 5" stroke-width="1.5"/><text x="${x1 + 4}" y="${r1(y) - 6}" class="ref">${esc(label)}</text>`;
}

const PALETTE = [C.blue, C.orange, C.ink, '#2A9D8F', '#7B5EA7'];
const SPORT_COLOR = { Football: C.blue, Baseball: C.orange, Basketball: C.ink, Hockey: '#2A9D8F', Soccer: '#7B5EA7' };
const fmtOf = (c) => (c.format === 'share' ? (v) => `${Math.round(v * 100)}%` : change);

function lineChart(c) {
  const W = 760, H = 330, L = 56, R = c.series.length > 1 ? 150 : 24, T = c.series.length > 1 ? 40 : 18, B = 34;
  const all = c.series.flatMap((s) => s.values).filter((v) => v != null);
  const max = Math.max(2.2, Math.ceil(Math.max(...all) * 5) / 5), min = Math.min(0.5, Math.floor(Math.min(...all) * 5) / 5);
  const x = (i) => L + (i * (W - L - R)) / (c.labels.length - 1);
  const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const ticks = [0.5, 1, 1.5, 2, 2.5, 3].filter((t) => t >= min && t <= max);
  const multi = c.series.length > 1;
  const endNote = multi && c.endLabel ? `<text x="${W - R + 8}" y="${T - 8}" class="axis">${esc(c.endLabel)}</text>` : '';
  const legend = multi ? c.series.map((s, k) => `<rect x="${L + k * 130}" y="8" width="14" height="4" fill="${SPORT_COLOR[s.name] || PALETTE[k]}"/><text x="${L + 20 + k * 130}" y="15" class="axis">${esc(s.name)}</text>`).join('') : '';
  const color = (s, k) => SPORT_COLOR[s.name] || PALETTE[k];
  const endY = c.series.map((s) => { const v = s.values.filter((u) => u != null).at(-1); return v == null ? 0 : y(v); });
  const order = endY.map((v, k) => [v, k]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < order.length; i++) if (order[i][0] - order[i - 1][0] < 15) order[i][0] = order[i - 1][0] + 15;
  order.forEach(([v, k]) => { endY[k] = v; });
  const line = (s, k) => {
    const pts = s.values.map((v, i) => (v == null ? null : [r1(x(i)), r1(y(v))]));
    const segs = [];
    let cur = [];
    for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
    if (cur.length) segs.push(cur);
    const last = pts.map((p, i) => [p, i]).filter(([p]) => p).at(-1);
    return segs.map((sg) => `<polyline fill="none" stroke="${color(s, k)}" stroke-width="2.5" points="${sg.map((p) => p.join(',')).join(' ')}"/>`).join('')
      + pts.map((p) => (p ? `<circle cx="${p[0]}" cy="${p[1]}" r="${multi ? 3 : 4.5}" fill="${color(s, k)}" stroke="${C.white}" stroke-width="1.5"/>` : '')).join('')
      + (multi && last ? `<text x="${last[0][0] + 8}" y="${endY[k] + 4}" class="value" fill="${color(s, k)}">${esc(s.short || s.name)} ${change(s.end ?? s.values[last[1]])}</text>` : '');
  };
  const s0 = c.series[0];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.series.map((s) => s.name).join(', '))} by publish week">${legend}${endNote}
  ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${r1(y(t))}" y2="${r1(y(t))}" stroke="${C.grid}"/><text x="${L - 10}" y="${r1(y(t)) + 4}" text-anchor="end" class="axis">${change(t)}</text>`).join('')}
  ${c.ref ? refLine(y(c.ref.value), L, W - R, c.ref.label) : ''}
  ${c.labels.map((l, i) => `<text x="${r1(x(i))}" y="${H - 10}" text-anchor="middle" class="axis">${esc(l)}</text>`).join('')}
  ${c.marker ? (() => { const i = c.labels.indexOf(c.marker.at); return i < 0 ? '' : `<line x1="${r1(x(i))}" x2="${r1(x(i))}" y1="${T}" y2="${H - B}" stroke="${C.orange}" stroke-dasharray="4 4" stroke-width="1.5"/><text x="${r1(x(i)) - 6}" y="${T + 12}" text-anchor="end" class="ref">${esc(c.marker.label)}</text>`; })() : ''}
  ${c.gapAfter ? (() => { const i = c.labels.indexOf(c.gapAfter); return i < 0 ? '' : `<text x="${r1((x(i) + x(i + 1)) / 2)}" y="${H - 10}" text-anchor="middle" class="ref">//</text>`; })() : ''}
  ${c.series.map(line).join('')}
  ${multi ? '' : (c.pointLabels || []).map((l) => { const i = c.labels.indexOf(l); return i < 0 ? '' : `<text x="${r1(x(i))}" y="${r1(y(s0.values[i])) - 12}" text-anchor="middle" class="value">${change(s0.values[i])}</text>`; }).join('')}
</svg>`;
}

const whisker = (cx, yLo, yHi) => `<line x1="${r1(cx)}" x2="${r1(cx)}" y1="${r1(yLo)}" y2="${r1(yHi)}" stroke="${C.ink}" stroke-width="1.5"/><line x1="${r1(cx - 6)}" x2="${r1(cx + 6)}" y1="${r1(yLo)}" y2="${r1(yLo)}" stroke="${C.ink}" stroke-width="1.5"/><line x1="${r1(cx - 6)}" x2="${r1(cx + 6)}" y1="${r1(yHi)}" y2="${r1(yHi)}" stroke="${C.ink}" stroke-width="1.5"/>`;

function pairChart(c) {
  const colors = [C.blue, C.gray];
  const W = 860, H = 300, B = 52, groupW = (W - 20) / c.labels.length, barW = Math.min(70, groupW * 0.32);
  const all = c.series.flatMap((s) => [...s.values, ...(s.hi || [])]);
  const max = Math.max(...all) * 1.15;
  const h = (v) => ((H - B - 40) * v) / max;
  const legend = c.series.map((s, k) => `<rect x="${10 + k * 230}" y="2" width="14" height="14" rx="2" fill="${colors[k]}"/><text x="${30 + k * 230}" y="14" class="axis">${esc(s.name)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.caption)}">${legend}<line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="${C.grid}"/>
  ${c.labels.map((l, i) => {
    const gx = 10 + i * groupW + (groupW - 2 * barW - 8) / 2;
    return c.series.map((s, k) => {
      const v = s.values[i], xx = gx + k * (barW + 8), top = H - B - h(v);
      const label = s.hi ? H - B - h(s.hi[i]) : top;
      return `<rect x="${r1(xx)}" y="${r1(top)}" width="${r1(barW)}" height="${r1(h(v))}" rx="3" fill="${colors[k]}"/>${s.hi ? whisker(xx + barW / 2, H - B - h(s.lo[i]), label) : ''}<text x="${r1(xx + barW / 2)}" y="${r1(label - 8)}" text-anchor="middle" class="value">${fmtOf(c)(v)}</text>`;
    }).join('') + `<text x="${r1(10 + i * groupW + groupW / 2)}" y="${H - B + 20}" text-anchor="middle" class="axis">${esc(l)}</text>`;
  }).join('')}
</svg>`;
}

function barChart(c) {
  const color = (i) => (c.highlight && !c.highlight[i] ? C.gray : C.blue);
  const W = 860, H = 300, B = 52, colW = (W - 20) / c.labels.length, barW = Math.min(90, colW * 0.6);
  const max = Math.max(...c.values, ...(c.hi || []), c.ref?.value || 0) * 1.15;
  const h = (v) => ((H - B - 24) * v) / max;
  const words = (l) => {
    const out = [''];
    for (const w of l.split(' ')) (out.at(-1) + ' ' + w).trim().length > Math.max(10, colW / 8) ? out.push(w) : (out[out.length - 1] = (out.at(-1) + ' ' + w).trim());
    return out.slice(0, 3);
  };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.caption)}"><line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="${C.grid}"/>${c.ref ? refLine(H - B - h(c.ref.value), 0, W, c.ref.label) : ''}
  ${c.labels.map((l, i) => {
    const xx = 10 + i * colW + (colW - barW) / 2, top = H - B - h(c.values[i]);
    const label = c.hi ? H - B - h(c.hi[i]) : top;
    return `<rect x="${r1(xx)}" y="${r1(top)}" width="${r1(barW)}" height="${r1(h(c.values[i]))}" rx="3" fill="${color(i)}"/>${c.hi ? whisker(xx + barW / 2, H - B - h(c.lo[i]), label) : ''}<text x="${r1(xx + barW / 2 + (c.hi ? 0 : 0))}" y="${r1(label - 8)}" text-anchor="middle" class="value">${fmtOf(c)(c.values[i])}</text>${words(l).map((wl, k) => `<text x="${r1(xx + barW / 2)}" y="${H - B + 18 + k * 14}" text-anchor="middle" class="axis">${esc(wl)}</text>`).join('')}`;
  }).join('')}
</svg>`;
}

const caption = (c) => `<p class="caption">${esc(c.caption)} <em>Source: ${esc(c.source)}.</em></p>`;
const list = (items, cls = '') => `<ul class="${cls}">${items.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;

function body(s) {
  if (s.layout === 'title') return `<h1>${esc(s.title)}</h1>${s.facts ? `<div class="facts">${s.facts.map(([k, v]) => `<div><p class="eyebrow">${esc(k)}</p><p>${esc(v)}</p></div>`).join('')}</div>` : `<p class="lead">${esc(s.lead)}</p>`}${list(s.points, 'quiet')}`;
  if (s.layout === 'statement') return `<p class="eyebrow">Recommendation</p><h1>${esc(s.title)}</h1><p class="lead">${esc(s.lead)}</p>${list(s.points, 'quiet')}`;
  if (s.layout === 'closing') {
    const items = s.offers ? `<ol class="steps offers">${s.offers.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ol>` : `<ol class="steps">${s.steps.map(([skill, what, url]) => `<li><a href="${esc(url)}">${esc(skill)}</a><span>${esc(what)}</span></li>`).join('')}</ol>`;
    return `<h2>${esc(s.title)}</h2><div class="body">${items}<p class="lead small">${esc(s.lead)}</p><p class="links">${s.links.map(([label, url]) => `<a href="${esc(url)}">${esc(label)}</a>`).join('<span>·</span>')}</p></div>`;
  }
  let inner = `<h2>${esc(s.title)}</h2>`;
  if (s.chart?.kind === 'line') {
    inner += `<p class="lead">${esc(s.lead)}</p><div class="split"><div class="chart">${lineChart(s.chart)}</div><div class="card"><p class="eyebrow">${esc(s.temptingLabel || 'The tempting read')}</p><p>${esc(s.tempting)}</p></div></div>${caption(s.chart)}`;
  } else if (s.chart) {
    inner += `<p class="lead">${esc(s.lead)}</p><div class="chart">${s.chart.kind === 'pairs' ? pairChart(s.chart) : barChart(s.chart)}</div>${caption(s.chart)}`;
  } else if (s.split) {
    const sp = s.split;
    const cells = (n, cls) => Array.from({ length: n }, () => `<i class="${cls}"></i>`).join('');
    inner += `<div class="body"><div class="dots">${cells(sp.kept, 'kept')}${cells(sp.added, 'added')}</div><div class="legend"><span><i class="kept"></i>${sp.kept} ${esc(sp.keptLabel)}</span><span><i class="added"></i>${sp.added} ${esc(sp.addedLabel)}</span></div><p class="lead">${esc(s.lead)}</p></div>`;
  } else if (s.stats) {
    inner += `<div class="body"><div class="stats" style="grid-template-columns: ${s.stats.length === 3 ? '1.3fr 1fr 1fr' : s.stats.length === 2 ? '1fr 1fr' : '1fr'}">${s.stats.map((t, i) => `<div class="stat-card${i === 0 ? ' lead-stat' : ''}"><p class="big"${t.value.length > 10 ? ' style="font-size: 44px"' : ''}>${esc(t.value)}</p><p class="card-label">${esc(t.label)}</p><p class="sub">${esc(t.sub)}</p></div>`).join('')}</div><p class="lead">${esc(s.lead)}</p>${s.asks ? `<ol class="asks">${s.asks.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join('')}</ol>` : ''}</div>`;
  } else if (s.asks) {
    inner += `<div class="body"><p class="lead">${esc(s.lead)}</p><ol class="asks">${s.asks.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join('')}</ol></div>`;
  } else if (s.cards) {
    inner += `<div class="cards" style="grid-template-columns: repeat(${s.cards.length}, 1fr)">${s.cards.map((c) => `<div class="card"><p class="stat">${esc(c.stat)}</p><p class="card-label">${esc(c.label)}</p><p>${esc(c.body)}</p></div>`).join('')}</div>`;
  } else if (s.table) {
    inner += `<div class="body"><table class="options"><thead><tr>${s.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="lead">${esc(s.lead)}</p></div>`;
  } else if (s.triggers) {
    inner += `<div class="body"><div class="triggers">${s.triggers.map((t, i) => `<div class="trigger${i === 0 ? ' first' : ''}"><p class="when">${esc(t.when)}</p><p>${esc(t.what)}</p></div>`).join('')}</div></div>`;
  }
  return inner;
}

function appendixPages(t) {
  const per = t.rows.length <= 18 ? 18 : 15;
  const pages = [];
  for (let i = 0; i < t.rows.length; i += per) pages.push(t.rows.slice(i, i + per));
  return pages.map((rows, k) => ({ title: pages.length > 1 ? `${t.title} (${k + 1} of ${pages.length})` : t.title, rows, last: k === pages.length - 1 }));
}

const dark = (s) => ['title', 'statement', 'closing'].includes(s.layout);
let page = 0;
const footer = (label) => `<footer><span>Sporting Works · YouTube view count analysis</span><span>${label}</span></footer>`;
const mainSlides = slides.map((s) => {
  page += 1;
  return `<section class="slide ${s.layout || 'content'}${dark(s) ? ' dark' : ''}" id="${esc(s.id)}" aria-label="Slide ${page}">
${body(s)}
${footer(page)}
<aside class="notes">${esc(s.notes || '')}</aside>
</section>`;
});
let apx = 0;
const appendixSlides = [`<section class="slide divider dark" id="appendix" aria-label="Appendix"><p class="eyebrow">Appendix</p><h1>Sport and channel detail</h1><p class="lead">Each page is a view of one file in analysis/results/. Ratios are after ÷ before. Ranges are 95% intervals from resampling channels.</p>${footer('A')}</section>`,
  ...appendix.flatMap((t) => (t.divider ? [t] : t.chart ? [t] : appendixPages(t)).map((p) => {
    if (t.divider) return `<section class="slide divider dark" aria-label="${esc(t.divider)}"><p class="eyebrow">Appendix</p><h1>${esc(t.divider)}</h1><p class="lead">How the headline was measured and tested: both measures, the transition weeks, the no-change comparisons, segments, sensitivity, and lifetime totals.</p>${footer('A')}</section>`;
    if (t.chart) {
      apx += 1;
      const svg = t.chart.kind === 'line' ? lineChart(t.chart) : t.chart.kind === 'pairs' ? pairChart(t.chart) : barChart(t.chart);
      return `<section class="slide appendix chart-page" aria-label="${esc(t.title)}"><h3>${esc(t.title)}</h3>${t.lead ? `<p class="lead small">${esc(t.lead)}</p>` : ''}<div class="chart">${svg}</div><p class="caption">${t.note ? `${esc(t.note)} ` : ''}<em>Source: ${esc(t.source)}.</em></p>${footer(t.title.split('.')[0])}</section>`;
    }
    apx += 1;
    return `<section class="slide appendix" aria-label="${esc(p.title)}"><h3>${esc(p.title)}</h3><table class="data${p.rows.length > 15 ? ' dense' : ''}"><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${p.rows.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="caption">${p.last && t.note ? `${esc(t.note)} ` : ''}<em>Source: ${esc(t.source)}.</em></p>${footer(t.title.split('.')[0])}</section>`;
  }))];

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<style>
@page { size: 13.333in 7.5in; margin: 0; }
* { box-sizing: border-box; margin: 0; }
html { background: #d9dde2; }
body { font-family: "Helvetica Neue", Arial, sans-serif; color: ${C.ink}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.slide { position: relative; width: 1280px; height: 720px; margin: 32px auto; padding: 56px 64px 64px; background: ${C.white}; overflow: hidden; box-shadow: 0 8px 30px #15202b26; display: flex; flex-direction: column; gap: 18px; }
.slide.dark { background: ${C.ink}; color: ${C.white}; }
h1, h2, h3 { font-family: "Iowan Old Style", Charter, Georgia, serif; font-weight: 700; letter-spacing: -0.01em; line-height: 1.12; }
h1 { font-size: 50px; max-width: 1100px; }
h2 { font-size: 33px; max-width: 1140px; }
h3 { font-size: 24px; }
.slide.title h1 { margin-top: 90px; }
.slide.title:has(.facts) h1 { margin-top: 30px; }
.facts { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 28px; margin: 28px 0 8px; }
.facts p:not(.eyebrow) { font-size: 19px; line-height: 1.4; margin: 6px 0 0; }
.slide.statement h1 { font-size: 44px; margin-top: 30px; }
.slide.divider h1 { margin-top: 170px; }
.lead { font-size: 20px; line-height: 1.4; color: ${C.muted}; max-width: 1140px; }
.dark .lead { color: ${C.white}; }
.lead.small { font-size: 17px; }
ul { padding-left: 22px; display: grid; gap: 8px; font-size: 19px; line-height: 1.4; }
ul.quiet { color: ${C.gray}; }
.eyebrow { font-size: 14px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${C.orange}; }
.chart { flex: 1; min-height: 0; display: flex; align-items: center; }
.chart svg { width: 100%; max-height: 100%; }
.split { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 320px; gap: 28px; align-items: center; }
.card { background: ${C.paper}; border-radius: 10px; padding: 22px 24px; font-size: 16px; line-height: 1.45; color: ${C.muted}; }
.split .card p:last-child { font-size: 20px; color: ${C.ink}; margin-top: 10px; }
svg text { font-family: "Helvetica Neue", Arial, sans-serif; }
svg .axis { font-size: 13px; fill: ${C.muted}; }
svg .value { font-size: 14px; font-weight: 700; fill: ${C.ink}; paint-order: stroke; stroke: ${C.white}; stroke-width: 4px; }
svg .ref { font-size: 13px; font-weight: 700; fill: ${C.orange}; paint-order: stroke; stroke: ${C.white}; stroke-width: 4px; }
.caption { font-size: 14px; color: ${C.muted}; line-height: 1.4; }
.body { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 28px; }
.stats { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 22px; }
.stat-card { background: ${C.paper}; border-radius: 10px; padding: 28px; display: flex; flex-direction: column; gap: 10px; }
.stat-card.lead-stat { background: ${C.ink}; color: ${C.white}; }
.big { font-family: "Iowan Old Style", Charter, Georgia, serif; font-size: 64px; font-weight: 700; color: ${C.blue}; line-height: 1; }
.lead-stat .big { color: ${C.white}; font-size: 80px; }
.stat-card .card-label { font-size: 18px; }
.lead-stat .card-label { color: ${C.white}; }
.sub { font-size: 16px; color: ${C.muted}; }
.lead-stat .sub { color: ${C.gray}; }
.cards .card { font-size: 18px; }
.asks { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; counter-reset: ask; }
.asks li { border: 2px solid ${C.grid}; border-radius: 10px; padding: 18px 20px; display: grid; gap: 6px; font-size: 16px; line-height: 1.4; color: ${C.muted}; counter-increment: ask; }
.asks strong { color: ${C.ink}; font-size: 18px; }
.asks strong::before { content: counter(ask) ". "; color: ${C.orange}; }
.cards { margin: auto 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; align-items: stretch; }
.cards .card { min-height: 300px; display: flex; flex-direction: column; gap: 12px; }
.stat { font-family: "Iowan Old Style", Charter, Georgia, serif; font-size: 30px; font-weight: 700; color: ${C.blue}; white-space: nowrap; min-height: 40px; }
.card-label { font-weight: 700; color: ${C.ink}; }
table { border-collapse: collapse; }
table.options { font-size: 18px; line-height: 1.4; }
th { background: ${C.ink}; color: ${C.white}; text-align: left; padding: 12px 14px; }
td { border-bottom: 1px solid ${C.grid}; padding: 14px; vertical-align: top; }
table.options td:first-child { font-weight: 700; width: 34%; }
table.data { font-size: 14px; line-height: 1.3; width: 100%; }
table.data th { padding: 8px 10px; font-size: 13px; }
table.data td { padding: 6px 10px; }
table.data.dense td { padding: 3px 10px; font-size: 13px; }
.triggers { display: grid; gap: 24px; }
.trigger { display: grid; grid-template-columns: 240px 1fr; gap: 30px; align-items: center; font-size: 21px; line-height: 1.45; }
.when { background: ${C.paper}; border-radius: 10px; padding: 30px 16px; text-align: center; font-weight: 700; }
.trigger.first .when { background: ${C.orange}; color: ${C.white}; }
.steps { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; counter-reset: step; }
.steps li { background: ${C.ink2}; border-radius: 10px; padding: 24px; display: grid; gap: 8px; counter-increment: step; }
.steps a { color: ${C.white}; font-size: 22px; font-weight: 700; text-decoration: none; }
.steps a::before { content: counter(step) "  "; color: ${C.orange}; }
.offers b { color: ${C.white}; font-size: 22px; }
.offers b::before { content: counter(step) "  "; color: ${C.orange}; }
.dots { display: grid; grid-template-columns: repeat(20, 1fr); gap: 8px; max-width: 900px; }
.dots i, .legend i { display: block; aspect-ratio: 1; border-radius: 50%; }
.dots i.kept, .legend i.kept { background: ${C.blue}; }
.dots i.added, .legend i.added { background: ${C.orange}; }
.legend { display: flex; gap: 36px; font-size: 20px; font-weight: 700; }
.legend span { display: flex; align-items: center; gap: 10px; }
.legend i { width: 18px; }
.steps span { color: ${C.gray}; font-size: 16px; line-height: 1.4; }
.links { display: flex; gap: 14px; font-size: 16px; }
.links a, .links span { color: ${C.gray}; }
footer { position: absolute; left: 64px; right: 64px; bottom: 24px; display: flex; justify-content: space-between; font-size: 12px; color: ${C.muted}; }
.dark footer { color: ${C.gray}; }
.notes { display: none; }
@media print {
  html { background: none; }
  .slide { margin: 0; box-shadow: none; width: 13.333in; height: 7.5in; break-after: page; }
}
</style>
</head>
<body>
${mainSlides.join('\n')}
${appendixSlides.join('\n')}
</body>
</html>
`;

mkdirSync(dirname(htmlPath), { recursive: true });
writeFileSync(htmlPath, html);
console.log(htmlPath);

if (!process.argv.includes('--html-only')) {
  const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome}. Set CHROME, or pass --html-only.`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--run-all-compositor-stages-before-draw', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: 'pipe' });
  console.log(pdfPath);
}
