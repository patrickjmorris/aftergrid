"""Comparison with published estimates of the same change (added 2026-10-28, after the round-2 review).

Published estimates (../external/published_estimates.csv) divide public views by engaged views on the same videos.
Ours compares day-29 public views of different cohorts in the same channels. Agentio reports its ratio by channel
size, and the ratio falls with size, so a fair comparison needs our estimate on the same size tiers.

lift_by_size_tier.csv   our day-29 contrast by size tiers defined like Agentio's: average views per video under 50k,
                        50k to 300k, 300k+. A channel's size is the mean old-rule count of its long-form videos outside
                        the estimate: each video's latest reading taken before 2026-08-24, skipping every video in the
                        pre or post group. So tiers use pre-period views only and do not reuse the estimate's own pre
                        readings (sorting on those builds in regression to the mean; see the size thirds in diagnose.py).
                        Channels with fewer than MIN_VIDEOS such videos get no tier.
                        Rows: the tiers across the switch; all tiered channels; Agentio's tier ratios applied to our
                        tier mix; the same tiers on a split where nothing changed; three other tier measures.
trial_rank_check_by_size.csv  the trial's success check (review.py) cut by these size tiers: each tier's balanced-weight
                        mean shift in within-cohort percentile across the switch and across the two cutovers where
                        nothing changed. A size gradient in the lift would move small channels' videos up within a week.
group_impacts.csv       the headline translated into the units of each group that uses public view counts: creators,
                        sponsors paying on public views, and Spot Sports' own rankings. Arithmetic only, from
                        primary_lift, ranking_illustration and the published estimates.
"""
import csv
import math
import os
import statistics as st
from collections import defaultdict

from common import CHANGE, day, write_csv
from diagnose import COLS, JUL1, SEP14, post_r, pre_r, row
from metric import LF_AGE, POST_START, lift, pick_reading, weight

EXTERNAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'external', 'published_estimates.csv')
TIERS = (('micro', 'under 50k'), ('mid', '50k to 300k'), ('macro', '300k+'))
MIN_VIDEOS = 3


def agentio():
    """Agentio's measured public / engaged ratios, keyed 'all', 'micro', 'mid', 'macro'."""
    out = {}
    with open(EXTERNAL, newline='') as f:
        for r in csv.DictReader(f):
            if r['source'] == 'Agentio' and r['measured_or_modeled'] == 'measured':
                key = r['segment'].split(' ')[0]
                if key in ('all', 'micro', 'mid', 'macro'):
                    out[key] = float(r['public_per_engaged_ratio'])
    return out


def split(size, lo=5e4, hi=3e5):
    out = {k: set() for k, _ in TIERS}
    for c, v in size.items():
        out['micro' if v < lo else 'mid' if v < hi else 'macro'].add(c)
    return out


def old_rule_size(rd, cs, used):
    """Mean of each video's latest pre-switch count, long-form videos outside the estimate, per channel."""
    last = {}
    for x in rd:
        if x['fmt'] == 0 and x['T'] < CHANGE and x['video'] not in used and x['channel'] in cs:
            if x['video'] not in last or x['T'] > last[x['video']]['T']:
                last[x['video']] = x
    per = defaultdict(list)
    for x in last.values():
        per[x['channel']].append(x['views'])
    return {c: sum(v) / len(v) for c, v in per.items() if len(v) >= MIN_VIDEOS}


def jan_apr_size(rows, cs):
    """Mean current lifetime count of the channel's long-form videos published 2026-01-01..04-30 (mostly read after
    the switch, so it includes some new-rule views)."""
    per = defaultdict(list)
    for r in rows:
        if r['is_yt_short'] == 0 and r['view_count'] is not None and day('2026-01-01 00:00:00') <= r['P'] < day('2026-05-01 00:00:00'):
            per[r['channel_key']].append(r['view_count'])
    return {c: sum(v) / len(v) for c, v in per.items() if c in cs and len(v) >= MIN_VIDEOS}


def size_tiers(rows, rd, res):
    lf = res['lf']
    cs = lf['cs']
    ag = agentio()
    lf_pick = pick_reading(rd, 0, *LF_AGE)
    used = {x['video'] for x in lf_pick if x['channel'] in cs and (pre_r(x) or post_r(x))}
    size = old_rule_size(rd, cs, used)
    tiers = split(size)
    den = {c: weight(v[0], v[5], 'balanced') * v[1] for c, v in cs.items()}  # each channel's part of the pooled denominator
    tiered = set(size)
    out = []

    measure = f'mean pre-switch count, videos outside the estimate, {MIN_VIDEOS}+ videos'
    shares = {}
    for k, lab in TIERS:
        shares[k] = sum(den[c] for c in tiers[k]) / sum(den[c] for c in tiered)
        r = lift(rd, 0, LF_AGE, picked=lf_pick, channels=tiers[k], reps=2000)
        out.append(row('switch', r, (measure, f'{k} ({lab})')) + [shares[k], 1 - 1 / r['ratio_of_totals'], ag[k]])
    r = lift(rd, 0, LF_AGE, picked=lf_pick, channels=tiered, reps=2000)
    ours = r['ratio_of_totals']
    out.append(row('switch', r, (measure, 'all tiered channels')) + [1.0, 1 - 1 / ours, ag['all']])
    on_mix = sum(shares[k] * ag[k] for k, _ in TIERS)
    blank = [''] * len(COLS)
    out.append(['Agentio tier ratios on our tier mix', measure, 'all tiered channels', on_mix] + blank[1:] + [1.0, 1 - 1 / on_mix, ''])
    out.append(['ours over Agentio on our tier mix', measure, 'all tiered channels', ours / on_mix] + blank[1:] + ['', '', ''])
    untiered = set(cs) - tiered
    out.append(['untiered channels (fewer than %d videos outside the estimate)' % MIN_VIDEOS, measure, 'none',
                ''] + blank[1:6] + [len(untiered), sum(cs[c][0] for c in untiered), sum(cs[c][5] for c in untiered), '', '',
                                     sum(den[c] for c in untiered) / sum(den.values()), '', ''])

    for k, lab in TIERS:
        r = lift(rd, 0, LF_AGE, picked=lf_pick, channels=tiers[k], reps=1000,
                 pre_rule=lambda x: pre_r(x) and x['P'] < JUL1, post_rule=lambda x: pre_r(x) and x['P'] >= JUL1)
        out.append(row('null: published before vs after 07-01, all read before the switch', r, (measure, f'{k} ({lab})')) + ['', '', ''])

    others = (('thresholds divided by Agentio all-video ratio (if its tiers count public views)',
               split(size, 5e4 / ag['all'], 3e5 / ag['all'])),
              (f'mean lifetime count, long-form published 2026-01-01..04-30, {MIN_VIDEOS}+ videos', split(jan_apr_size(rows, cs))),
              ('pre group day-29 mean (biased by regression to the mean)', split({c: v[1] for c, v in cs.items()})))
    for lab_m, t in others:
        for k, lab in TIERS:
            r = lift(rd, 0, LF_AGE, picked=lf_pick, channels=t[k], reps=1000) if t[k] else None
            out.append(row('switch', r, (lab_m, f'{k} ({lab})')) + ['', 1 - 1 / r['ratio_of_totals'] if r else '', ag[k]])

    write_csv('lift_by_size_tier.csv', ['comparison', 'tier_measure', 'tier'] + COLS +
              ['share_of_pooled_pre_views', 'share_of_post_count_not_counted_under_old_rule', 'agentio_public_per_engaged'], out)
    return out, tiers


def cohort_percentiles(lf_pick):
    """Mid-rank percentile of day-29 views within the trial's ranking cohorts, as in review.py's success check:
    Monday-start publish weeks, 08-27..08-30 its own cohort, the transition band 07-27..08-26 left out."""
    band = (CHANGE - 28, CHANGE + 3)
    coh = defaultdict(list)
    for x in lf_pick:
        if not band[0] <= x['P'] < band[1]:
            coh['split' if CHANGE + 3 <= x['P'] < CHANGE + 7 else math.floor((x['P'] - CHANGE) / 7)].append(x)
    pct = {}
    for xs in coh.values():
        xs.sort(key=lambda x: x['views'])
        i = 0
        while i < len(xs):
            j = i
            while j + 1 < len(xs) and xs[j + 1]['views'] == xs[i]['views']:
                j += 1
            for t in range(i, j + 1):
                pct[xs[t]['video']] = 100 * ((i + j) / 2 + 0.5) / len(xs)
            i = j + 1
    return pct


def tier_rank_shift(rd, tiers):
    lf_pick = pick_reading(rd, 0, *LF_AGE)
    pct = cohort_percentiles(lf_pick)
    tier_of = {c: k for k, cs_ in tiers.items() for c in cs_}
    cuts = (('switch: read before 08-24 vs published 08-27 on', pre_r, lambda x: x['P'] >= CHANGE + 3),
            ('null: published before vs after 07-01, all read before 08-24',
             lambda x: pre_r(x) and x['P'] < JUL1, lambda x: pre_r(x) and x['P'] >= JUL1),
            ('null: published 08-31..09-13 vs 09-14 on', lambda x: POST_START <= x['P'] < SEP14, lambda x: x['P'] >= SEP14))
    out = []
    for lab, a, b in cuts:
        gg = defaultdict(lambda: ([], []))
        for x in lf_pick:
            if x['video'] in pct and x['channel'] in tier_of:
                if a(x):
                    gg[x['channel']][0].append(pct[x['video']])
                elif b(x):
                    gg[x['channel']][1].append(pct[x['video']])
        by = defaultdict(list)
        for c, (u, v) in gg.items():
            if u and v:
                by[tier_of[c]].append((st.mean(v) - st.mean(u), weight(len(u), len(v), 'balanced')))
        m = {k: sum(d * w for d, w in by[k]) / sum(w for _, w in by[k]) for k, _ in TIERS}
        out.append([lab] + [x for k, _ in TIERS for x in (len(by[k]), m[k])] + [m['micro'] - m['macro']])
    write_csv('trial_rank_check_by_size.csv', ['cutover'] + [f'{k}_{x}' for k, _ in TIERS for x in ('channels', 'mean_shift_pct_points')] +
              ['micro_minus_macro_pct_points'], out)
    return out


def group_impacts(res):
    lf = res['lf']
    ag = agentio()
    R, lo, hi = lf['ratio_of_totals'], lf['rt_lo'], lf['rt_hi']
    T, tlo, thi = lf['typical_video'], lf['tv_lo'], lf['tv_hi']
    rk = {r[0]: r for r in res['rank']}
    src = 'primary_lift.csv; Agentio from ../external/published_estimates.csv'
    out = [
        ['creators', 'public views at day 29, post-change over pre-change videos, same channels, pooled', R, lo, hi, ag['all'], src],
        ['creators', 'same, typical video', T, tlo, thi, '', 'primary_lift.csv'],
        ['sponsors', 'share of a post-change count that would not have counted under the old rule, 1 - 1/ratio, pooled',
         1 - 1 / R, 1 - 1 / lo, 1 - 1 / hi, 1 - 1 / ag['all'], src],
        ['sponsors', 'same, typical video', 1 - 1 / T, 1 - 1 / tlo, 1 - 1 / thi, '', 'primary_lift.csv'],
        ['sponsors', 'cost per old-rule view at an unchanged price per public view, new over old', R, lo, hi, ag['all'], src],
        ['sponsors', 'price per public view that keeps cost per old-rule view unchanged, as a share of the old price, 1/ratio',
         1 / R, 1 / hi, 1 / lo, 1 / ag['all'], src],
        ['sponsors', 'added views (plays with under 30 seconds of watching) that reached a sponsor read starting at or after 0:30, '
         'played from the start without skipping', 0, '', '', 0, 'definition: the old rule counted a view after 30 seconds of watching'],
        ['spot sports', 'post-change share of the pool, matched channels, day-29 views', rk[100][2], '', '', '', 'ranking_illustration.csv'],
        ['spot sports', 'post-change share of the top 100 by raw views', rk[100][3], '', '', '', 'ranking_illustration.csv'],
        ['spot sports', 'post-change share of the top 1,000 by raw views', rk[1000][3], '', '', '', 'ranking_illustration.csv'],
        ['spot sports', 'top 1,000 share over pool share', rk[1000][3] / rk[1000][2], '', '', '', 'ranking_illustration.csv'],
    ]
    write_csv('group_impacts.csv', ['group', 'quantity', 'ours', 'ours_lo', 'ours_hi', 'agentio', 'source'], out)
    return out


def run(rows, rd, res):
    res['size_tiers'], tiers = size_tiers(rows, rd, res)
    res['tier_rank_shift'] = tier_rank_shift(rd, tiers)
    res['group_impacts'] = group_impacts(res)
