// Every number the deck and the site page cite, read from the saved analysis results.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RESULTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'analysis', 'results');

export function readCsv(name) {
  const [header, ...lines] = readFileSync(join(RESULTS, `${name}.csv`), 'utf8').trim().split(/\r?\n/);
  const parse = (line) => [...line.matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1);
  const cols = parse(header + ',');
  return lines.map((line) => Object.fromEntries(parse(line + ',').map((v, i) => [cols[i], v])));
}

const n = Number;
const one = (rows, pred, what) => {
  const hit = rows.filter(pred);
  if (hit.length !== 1) throw new Error(`expected one row for ${what}, got ${hit.length}`);
  return hit[0];
};
export const x = (v) => `${n(v).toFixed(2)}x`;
export const pct = (v) => `${Math.round((n(v) - 1) * 100)}%`;
export const change = (v) => { const p = Math.round((n(v) - 1) * 100); return p > 0 ? `+${p}%` : p < 0 ? `−${-p}%` : '0%'; };
export const share = (v) => `${Math.round(n(v) * 100)}%`;
export const int = (v) => Math.round(n(v)).toLocaleString('en-US');

const primary = readCsv('primary_lift');
const lf = one(primary, (r) => r.estimate.startsWith('long-form'), 'long-form headline');
const sh = one(primary, (r) => r.estimate.startsWith('shorts'), 'shorts headline');
const events = readCsv('event_study').filter((r) => r.unit === 'week' && r.series.startsWith('long-form') && r.publish_start >= '2026-06-15');
const transition = readCsv('transition_lift');
const nulls = readCsv('null_comparisons');
const segments = readCsv('lift_by_segment');
const dispersion = readCsv('segment_dispersion');
const sensitivity = readCsv('sensitivity');
const stock = readCsv('stock_translation');
const checks = readCsv('review_checks');
const quantiles = readCsv('quantile_ratios');
const trial = readCsv('trial_rank_check');
const ranking = readCsv('ranking_illustration');
const sportEvents = readCsv('sport_event_study');
const catalog = readCsv('sport_catalog');
const chDist = readCsv('channel_lift_distribution');
const formatLift = readCsv('format_lift');
const chExamples = readCsv('channel_examples');
const chSumm = readCsv('channel_lift_summary');
const chRow = (cut, sport) => one(chSumm, (r) => r.comparison.startsWith(cut) && r.sport === sport, `${cut} ${sport}`);
const tiers = readCsv('lift_by_size_tier');
const decomp = readCsv('decomposition_channel_mix');
const cuts = sensitivity.filter((r) => !/shorts|^\s*same/i.test(r.variant));
const decompVal = (item) => n(one(decomp, (r) => r.item.trim() === item, item).value);
const impacts = readCsv('group_impacts');
const external = (() => {
  const [header, ...lines] = readFileSync(join(RESULTS, '..', 'external', 'published_estimates.csv'), 'utf8').trim().split(/\r?\n/);
  const parse = (line) => [...(line + ',').matchAll(/("(?:[^"]|"")*"|[^,]*)(?:,|$)/g)].map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, -1);
  const cols = parse(header);
  return lines.map((l) => Object.fromEntries(parse(l).map((v, i) => [cols[i], v])));
})();
const tierRows = tiers.filter((r) => r.comparison === 'switch' && r.tier_measure.startsWith('mean pre-switch count'));
const tierOn = (label) => one(tierRows, (r) => r.tier.startsWith(label), label);
const agentioOnMix = one(tiers, (r) => r.comparison.startsWith('Agentio tier ratios'), 'agentio on mix');
const impact = (q) => one(impacts, (r) => r.quantity.startsWith(q), q);
const macroAlt = tiers.filter((r) => r.comparison === 'switch' && r.tier.startsWith('macro') && !r.tier_measure.includes('biased')).map((r) => n(r.ratio_of_totals));

const check = (prefix) => one(checks, (r) => r.check.trim().startsWith(prefix), prefix);
const stockRow = (group, accrual, R) => one(stock, (r) => r.group === group && r.accrual === accrual && r.R_used === R, `${group} ${accrual} ${R}`);
const allLf = (accrual, R) => n(stockRow('all long-form', accrual, R).lift_on_stored_total);
const trialSwitch = one(trial, (r) => r.cutover.startsWith('switch'), 'trial switch');
const trialNulls = trial.filter((r) => r.cutover.startsWith('null')).map((r) => n(r.sd_sport_shift_pct_points));
const nullMain = nulls.filter((r) => r.in_null_spread === 'yes');
const nullLf = nullMain.filter((r) => r.comparison.startsWith('long-form'));
const sports = segments.filter((r) => r.segment_type === 'sport');

export const N = {
  pooled: x(lf.ratio_of_totals), pooledPct: pct(lf.ratio_of_totals), pooledLoPct: pct(lf.rt_lo), pooledHiPct: pct(lf.rt_hi),
  typical: x(lf.typical_video), typicalPct: pct(lf.typical_video), typicalLoPct: pct(lf.tv_lo), typicalHiPct: pct(lf.tv_hi),
  channels: int(lf.channels), preVideos: int(lf.pre_videos), postVideos: int(lf.post_videos),
  shortsPooled: x(sh.ratio_of_totals), shortsTypical: x(sh.typical_video),
  shortsChange: change(sh.ratio_of_totals), shortsLo: change(sh.rt_lo), shortsHi: change(sh.rt_hi),
  nullLowChange: change(Math.min(...nullMain.map((r) => n(r.ratio_of_totals)))), nullHighChange: change(Math.max(...nullMain.map((r) => n(r.ratio_of_totals)))),
  nullLow: x(Math.min(...nullMain.map((r) => n(r.ratio_of_totals)))), nullHigh: x(Math.max(...nullMain.map((r) => n(r.ratio_of_totals)))),
  nullLfLow: x(Math.min(...nullLf.map((r) => n(r.ratio_of_totals)))), nullLfHigh: x(Math.max(...nullLf.map((r) => n(r.ratio_of_totals)))),
  catalogModeledPct: `${Math.round(n(check('all long-form stored-total lift, modeled').value) * 100)}%`,
  catalogScenarioLowPct: `${Math.round(allLf('flat_rate', 'low') * 100)}%`, catalogScenarioHighPct: `${Math.round(allLf('even_spread', 'high') * 100)}%`,
  catalogDataLowPct: `${Math.round(allLf('identified_min', 'point') * 100)}%`, catalogDataHighPct: `${Math.round(allLf('identified_max', 'point') * 100)}%`,
  newVideosShareOfStored: share(n(stockRow('published on/after 2026-08-24', 'flat_rate', 'point').stored_views) / n(stockRow('all long-form', 'flat_rate', 'point').stored_views)),
  olderMixed: int(check('of which last read on or after 08-24').value), olderTotal: int(check('long-form videos published before 08-24').value),
  scaledTypical: x(check('post views divided by R: typical video').value),
  viewingRiseNeededPct: pct(check('underlying change needed for rule effect = 25%, ratio of totals').value),
  trialSwitchSd: n(trialSwitch.sd_sport_shift_pct_points).toFixed(1), trialNullLow: Math.min(...trialNulls).toFixed(1), trialNullHigh: Math.max(...trialNulls).toFixed(1),
  quantileLow: x(Math.min(...quantiles.map((r) => n(r.post_over_pre)))), quantileHigh: x(Math.max(...quantiles.map((r) => n(r.post_over_pre)))),
  sensitivityCount: String(sensitivity.length), sensitivityLow: x(Math.min(...sensitivity.map((r) => n(r.ratio_of_totals)))),
  sportLowName: sports.reduce((a, b) => (n(a.ratio_of_totals) < n(b.ratio_of_totals) ? a : b)).label,
  sportLow: x(Math.min(...sports.map((r) => n(r.ratio_of_totals)))), sportHigh: x(Math.max(...sports.map((r) => n(r.ratio_of_totals)))),
  sportCount: String(sports.length),
  naivePct: pct(decompVal('pooled mean, all channels, post') / decompVal('pooled mean, all channels, pre')),
  cpmExample: `$${(30 * n(lf.ratio_of_totals)).toFixed(0)}`, cpmExampleLo: `$${(30 * n(lf.rt_lo)).toFixed(0)}`, cpmExampleHi: `$${(30 * n(lf.rt_hi)).toFixed(0)}`,
  holdCpm: `$${Math.round(30 * n(impact('price per public view').ours))}`, holdCpmLo: `$${Math.round(30 * n(impact('price per public view').ours_lo))}`, holdCpmHi: `$${Math.round(30 * n(impact('price per public view').ours_hi))}`,
  campaignEngaged: (Math.round(1000 / n(lf.ratio_of_totals))).toString(), sensLowPct: pct(Math.min(...cuts.map((r) => n(r.ratio_of_totals)))), sensHighPct: pct(Math.max(...cuts.map((r) => n(r.ratio_of_totals)))), cutCount: String(cuts.length),
  shortsNoTopChange: change(one(nulls, (r) => r.comparison.startsWith('shorts across the switch, without'), 'shorts without top').ratio_of_totals),
  sep7Change: change(one(events, (r) => r.publish_start === '2026-09-07', 'sep7').ratio_of_totals), sep21Change: change(one(events, (r) => r.publish_start === '2026-09-21', 'sep21').ratio_of_totals),
  shortsCutLow: pct(Math.min(...sensitivity.filter((r) => /shorts|^\s*same/i.test(r.variant)).map((r) => n(r.ratio_of_totals)))), shortsCutHigh: pct(Math.max(...sensitivity.filter((r) => /shorts|^\s*same/i.test(r.variant)).map((r) => n(r.ratio_of_totals)))),
  cutCpmHi: `$${Math.round(30 / Math.min(...cuts.map((r) => n(r.ratio_of_totals))))}`, cutCostLo: `$${Math.round(30 * Math.min(...cuts.map((r) => n(r.ratio_of_totals))))}`,
  latestCpm: `$${Math.round(30 / n(one(events, (r) => r.publish_start === '2026-09-21', 'sep21').ratio_of_totals))}`,
  newRuleNullChange: change(one(nulls, (r) => r.comparison.startsWith('long-form 28-30d: published 2026-08-31'), 'new rule null').ratio_of_totals), newRuleNullLo: change(one(nulls, (r) => r.comparison.startsWith('long-form 28-30d: published 2026-08-31'), 'nr').rt_lo), newRuleNullHi: change(one(nulls, (r) => r.comparison.startsWith('long-form 28-30d: published 2026-08-31'), 'nr').rt_hi),
  nullHiMaxPct: pct(Math.max(...nullMain.map((r) => n(r.rt_hi)))),
  countAtNullHiPct: pct(n(lf.ratio_of_totals) / Math.max(...nullMain.map((r) => n(r.rt_hi)))),
  costAtNullHi: `$${Math.round(30 * n(lf.ratio_of_totals) / Math.max(...nullMain.map((r) => n(r.rt_hi))))}`,
  cutLowRatio: n(Math.min(...cuts.map((r) => n(r.ratio_of_totals)))).toFixed(2),
  latestCost: `$${Math.round(30 * n(one(events, (r) => r.publish_start === '2026-09-21', 'sep21').ratio_of_totals))}`,
  typicalCost: `$${Math.round(30 * n(lf.typical_video))}`, typicalHold: `$${Math.round(30 / n(lf.typical_video))}`,
  aug24to26Pct: pct(one(transition, (r) => r.published.startsWith('2026-08-24'), 'aug24').ratio_of_totals),
  aug31Change: change(one(events, (r) => r.publish_start === '2026-08-31', 'aug31').ratio_of_totals),
  poolPostShare: share(one(ranking, (r) => r.top_n === '1000', 'rank').post_share_of_pool),
  top100PostShare: share(one(ranking, (r) => r.top_n === '100', 'rank').post_share_of_top_raw),
  top1000PostShare: share(one(ranking, (r) => r.top_n === '1000', 'rank').post_share_of_top_raw),
  top1000ScaledShare: share(one(ranking, (r) => r.top_n === '1000', 'rank').post_share_of_top_scaled_by_1_over_R),
  chCount: chRow('switch', 'All sports').channels, chRoseShare: share(chRow('switch', 'All sports').share_rose), chRoseNull: share(chRow('nothing', 'All sports').share_rose),
  hockeyChRose: share(chRow('switch', 'Hockey').share_rose), hockeyChNull: share(chRow('nothing', 'Hockey').share_rose), basketballChRose: share(chRow('switch', 'Basketball').share_rose),
  footballChRose: share(chRow('switch', 'Football').share_rose), footballCh: chRow('switch', 'Football').channels,
  lf2025: x(one(nulls, (r) => r.comparison.startsWith('long-form 2025'), 'lf2025').ratio_of_totals), lf2025Lo: x(one(nulls, (r) => r.comparison.startsWith('long-form 2025'), 'lf2025').rt_lo), lf2025Hi: x(one(nulls, (r) => r.comparison.startsWith('long-form 2025'), 'lf2025').rt_hi),
  catalogFlatPct: `${Math.round(allLf('flat_rate', 'point') * 100)}%`, catalogEvenPct: `${Math.round(allLf('even_spread', 'point') * 100)}%`,
  catalogChannels: int(catalog.reduce((a, r) => a + n(r.channels), 0)), catalogSports: String(catalog.length),
  chUnder125: `${chDist.filter((r) => r.comparison.startsWith('switch') && ['under 0.5x', '0.5x to 0.8x', '0.8x to 1.25x'].includes(r.channel_ratio)).reduce((a, r) => a + Math.round(n(r.share) * 100), 0)}%`,
  chOver4: share(one(chDist, (r) => r.comparison.startsWith('switch') && r.channel_ratio === '4x or more', 'over4').share),
  scenarioFee: `$${int(Math.round(30000 / n(lf.ratio_of_totals) / 100) * 100)}`,
  holdAtNullHi: `$${Math.round(30 * Math.max(...nullMain.map((r) => n(r.rt_hi))) / n(lf.ratio_of_totals))}`,
  multAtNullHi: (n(lf.ratio_of_totals) / Math.max(...nullMain.map((r) => n(r.rt_hi)))).toFixed(2),
  campaignEngagedRounded: String(Math.round(1000 / n(lf.ratio_of_totals) / 10) * 10),
  flatExampleEngaged: Math.round(100 / n(lf.ratio_of_totals)).toString(),
  holdPriceLoPct: share(impact('price per public view').ours_lo), holdPriceHiPct: share(impact('price per public view').ours_hi),
  tierMicro: x(tierOn('micro').ratio_of_totals), tierMid: x(tierOn('mid').ratio_of_totals), tierMacro: x(tierOn('macro').ratio_of_totals),
  tierMacroChannels: int(tierOn('macro').channels), tierAll: x(tierOn('all tiered').ratio_of_totals),
  agentioMicro: x(tierOn('micro').agentio_public_per_engaged), agentioMid: x(tierOn('mid').agentio_public_per_engaged), agentioMacro: x(tierOn('macro').agentio_public_per_engaged),
  agentioOnMix: x(agentioOnMix.ratio_of_totals), agentioHeadline: x(tierOn('all tiered').agentio_public_per_engaged),
  macroAltLow: x(Math.min(...macroAlt)), macroAltHigh: x(Math.max(...macroAlt)),
  notCountedPct: share(impact('share of a post-change count').ours), notCountedLoPct: share(impact('share of a post-change count').ours_lo), notCountedHiPct: share(impact('share of a post-change count').ours_hi),
  agentioNotCountedPct: share(impact('share of a post-change count').agentio),
  costPerRealView: x(impact('cost per old-rule view').ours), holdPricePct: share(impact('price per public view').ours),
  top1000Lift: x(impact('top 1,000 share over pool share').ours), poolShare: share(impact('post-change share of the pool').ours), top1000Share: share(impact('post-change share of the top 1,000').ours),
  sportLowChange: change(Math.min(...sports.map((r) => n(r.ratio_of_totals)))), sportHighChange: change(Math.max(...sports.map((r) => n(r.ratio_of_totals)))),
  jul20AfterShare: share((() => { const w = events.find((r) => r.publish_start === '2026-07-20'); return n(w.read_after_change) / n(w.videos); })()),
  sportSpreadSwitch: n(one(dispersion, (r) => r.dimension === 'sport' && r.cutover.startsWith('switch') && r.measure === 'ratio_of_totals', 'sport sd').sd_log_ratio).toFixed(2),
  sportSpreadNull: dispersion.filter((r) => r.dimension === 'sport' && !r.cutover.startsWith('switch') && r.measure === 'ratio_of_totals').map((r) => n(r.sd_log_ratio).toFixed(2)).join(' and '),
};

export const S = { formatLift, chExamples, trial, sportEvents, catalog, chDist, chSumm, tierRows, external, impacts, lf, sh, events, transition, nulls, segments, sensitivity, stock, checks, quantiles, trial, dispersion };

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(N);
