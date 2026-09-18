import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = dirname(fileURLToPath(import.meta.url));
function rows(file) {
  const [head, ...lines] = readFileSync(join(root, 'data', file), 'utf8').trim().split(/\r?\n/);
  const columns = head.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((value, i) => [columns[i], value])));
}
const sum = (xs, fn) => xs.reduce((n, row) => n + fn(row), 0);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

const conversion = rows('conversion.csv');
const baseline = conversion.filter(r => r.period === 'baseline');
const current = conversion.filter(r => r.period === 'current');
const sessions = xs => sum(xs, r => +r.eligible_sessions);
const signups = xs => sum(xs, r => +r.signups);
for (const row of conversion) {
  assert.ok(+row.signups >= 0 && +row.signups <= +row.eligible_sessions);
}
assert.equal(new Set(conversion.map(r => `${r.period}:${r.channel}`)).size, conversion.length);
const beforeRate = signups(baseline) / sessions(baseline);
const afterRate = signups(current) / sessions(current);
let mix = 0, within = 0;
for (const before of baseline) {
  const after = current.find(r => r.channel === before.channel);
  assert.ok(after);
  const beforeWeight = +before.eligible_sessions / sessions(baseline);
  const afterWeight = +after.eligible_sessions / sessions(current);
  const beforeChannelRate = +before.signups / +before.eligible_sessions;
  const afterChannelRate = +after.signups / +after.eligible_sessions;
  mix += (afterWeight - beforeWeight) * beforeChannelRate;
  within += afterWeight * (afterChannelRate - beforeChannelRate);
}
near(beforeRate, 0.088); near(afterRate, 0.062);
near(mix, -0.036); near(within, 0.01);
near(mix + within, afterRate - beforeRate);

const followup = rows('conversion-followup.csv');
const followupBefore = followup.filter(r => r.period === 'baseline');
const followupAfter = followup.filter(r => r.period === 'current');
const followupBeforeRate = signups(followupBefore) / sessions(followupBefore);
const followupAfterRate = signups(followupAfter) / sessions(followupAfter);
let followupMix = 0, followupWithin = 0;
for (const before of followupBefore) {
  const after = followupAfter.find(r => r.channel === before.channel);
  const rateBefore = +before.signups / +before.eligible_sessions;
  const rateAfter = +after.signups / +after.eligible_sessions;
  followupMix += (+after.eligible_sessions / sessions(followupAfter) - +before.eligible_sessions / sessions(followupBefore)) * rateBefore;
  followupWithin += +after.eligible_sessions / sessions(followupAfter) * (rateAfter - rateBefore);
}
near(followupBeforeRate, 0.062); near(followupAfterRate, 0.08);
near(followupMix, 0.012); near(followupWithin, 0.006);
near(followupMix + followupWithin, followupAfterRate - followupBeforeRate);

const revenue = rows('recurring-revenue.csv');
assert.equal(new Set(revenue.map(r => r.account_id)).size, revenue.length);
const beforeMrr = sum(revenue, r => +r.baseline_mrr_usd);
const afterMrr = sum(revenue, r => +r.current_mrr_usd);
const newMrr = sum(revenue, r => +r.baseline_mrr_usd === 0 ? +r.current_mrr_usd : 0);
const churn = sum(revenue, r => +r.current_mrr_usd === 0 ? +r.baseline_mrr_usd : 0);
const expansion = sum(revenue, r => +r.baseline_mrr_usd > 0 ? Math.max(0, +r.current_mrr_usd - +r.baseline_mrr_usd) : 0);
const contraction = sum(revenue, r => +r.current_mrr_usd > 0 ? Math.max(0, +r.baseline_mrr_usd - +r.current_mrr_usd) : 0);
assert.equal(beforeMrr, 430); assert.equal(afterMrr, 440);
assert.equal(beforeMrr + newMrr + expansion - contraction - churn, afterMrr);
assert.equal(newMrr, 90); assert.equal(churn, 80); assert.equal(expansion, 20); assert.equal(contraction, 20);

const onboarding = rows('onboarding.csv');
const completed = onboarding.find(r => r.completed_onboarding === 'yes');
const incomplete = onboarding.find(r => r.completed_onboarding === 'no');
const rateYes = +completed.retained_users_week4 / +completed.eligible_users;
const rateNo = +incomplete.retained_users_week4 / +incomplete.eligible_users;
near(rateYes - rateNo, 0.2); near(rateYes / rateNo - 1, 0.5);

console.log(JSON.stringify({
  dataset: 'Synthetic teaching cases; not customer results',
  conversion: { baseline_rate: beforeRate, current_rate: afterRate, delta_pp: (afterRate - beforeRate) * 100, mix_pp: mix * 100, within_channel_pp: within * 100, decomposition: 'baseline rates for mix, current weights for within-channel' },
  followup: { baseline_rate: followupBeforeRate, current_rate: followupAfterRate, delta_pp: (followupAfterRate - followupBeforeRate) * 100, mix_pp: followupMix * 100, within_channel_pp: followupWithin * 100 },
  revenue: { baseline_mrr_usd: beforeMrr, current_mrr_usd: afterMrr, new_mrr_usd: newMrr, expansion_usd: expansion, contraction_usd: contraction, churn_usd: churn, net_revenue_retention: (beforeMrr + expansion - contraction - churn) / beforeMrr },
  onboarding: { completed_retention: rateYes, incomplete_retention: rateNo, difference_pp: (rateYes - rateNo) * 100, relative_difference: rateYes / rateNo - 1, causal_effect: 'not identified by this observational extract' },
  checks: 'passed: unique grains, bounded conversion counts, conversion decomposition, MRR bridge and observed retention arithmetic'
}, null, 2));
