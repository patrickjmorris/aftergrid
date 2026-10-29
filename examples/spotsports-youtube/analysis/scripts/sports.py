"""Sports and channel cuts for the deck appendix. Added 2026-10-28 when the deck was rebuilt around sports.

sport_catalog.csv           the catalog by channel sport: channels, videos, long-form share, long-form length, and each
                            sport's share of stored long-form views. Descriptive; no comparison.
sport_event_study.csv       the primary estimator by publish week for the five largest sports, long-form at 28-30 days,
                            against each channel's pre-change level. Weeks with fewer than 15 videos are left out.
channel_lift_distribution.csv  one ratio per channel (mean views of new videos over mean of earlier ones, at 28-30 days,
                            channels with at least 5 videos on each side), binned. Across the switch and across a
                            cutover where nothing changed (published before vs after 07-01, all read before 08-24).
channel_lift_summary.csv    the same per-channel ratios summarized overall and for the five largest sports.
"""
import math
import random
import statistics as st
from collections import defaultdict

from common import CHANGE, channel_sport, day, iso, write_csv
from metric import LF_AGE, POST_START, estimate, pick_reading, quantile

JUL1 = day('2026-07-01 00:00:00')
YEAR_START = day('2026-01-01 00:00:00')
TOP_SPORTS = ['Soccer', 'Basketball', 'Baseball', 'Hockey', 'Football']
BINS = [(0, 0.5, 'under 0.5x'), (0.5, 0.8, '0.5x to 0.8x'), (0.8, 1.25, '0.8x to 1.25x'), (1.25, 2, '1.25x to 2x'),
        (2, 4, '2x to 4x'), (4, math.inf, '4x or more')]
MIN_VIDEOS = 5


def pre_r(x):
    return x['T'] < CHANGE


def week_cells(pick, chans):
    base = defaultdict(list)
    for x in pick:
        if x['channel'] in chans and pre_r(x):
            base[x['channel']].append(x['views'])
    bstat = {c: (len(v), st.mean(v), st.mean(math.log1p(u) for u in v)) for c, v in base.items()}
    cell = defaultdict(lambda: defaultdict(list))
    for x in pick:
        if x['channel'] in bstat:
            cell[math.floor((x['P'] - CHANGE) / 7)][x['channel']].append(x['views'])
    return bstat, cell


def boot(ccs, reps=300, seed=20261028):
    rng = random.Random(seed)
    chans = list(ccs)
    out = sorted(estimate(ccs, [chans[rng.randrange(len(chans))] for _ in chans])[0] for _ in range(reps))
    return quantile(out, 0.025), quantile(out, 0.975)


def channel_ratios(pick, pre_rule, post_rule):
    a, b = defaultdict(list), defaultdict(list)
    for x in pick:
        if pre_rule(x):
            a[x['channel']].append(x['views'])
        elif post_rule(x):
            b[x['channel']].append(x['views'])
    out = {}
    for c in set(a) & set(b):
        if len(a[c]) >= MIN_VIDEOS and len(b[c]) >= MIN_VIDEOS and st.mean(a[c]) > 0:
            out[c] = st.mean(b[c]) / st.mean(a[c])
    return out


def run(rows, rd):
    csport = channel_sport(rows)
    lf_pick = pick_reading(rd, 0, *LF_AGE)

    # ---------- Catalog by sport ----------
    cat = defaultdict(lambda: dict(channels=set(), videos=0, lf=0, lf_2026=0, dur=[], lf_views=0))
    for r in rows:
        sp = csport.get(r['channel_key'])
        if sp is None or r['is_yt_short'] is None:
            continue
        d = cat[sp]
        d['channels'].add(r['channel_key'])
        d['videos'] += 1
        if r['is_yt_short'] == 0:
            d['lf'] += 1
            d['lf_views'] += r['view_count'] or 0
            if r['P'] >= YEAR_START:
                d['lf_2026'] += 1
            if r['duration_seconds']:
                d['dur'].append(r['duration_seconds'])
    total_views = sum(d['lf_views'] for d in cat.values())
    out = []
    for sp, d in sorted(cat.items(), key=lambda kv: -len(kv[1]['channels'])):
        out.append([sp, len(d['channels']), d['videos'], d['lf'] / d['videos'], d['lf_2026'],
                    st.median(d['dur']) / 60 if d['dur'] else '', d['lf_views'] / total_views])
    write_csv('sport_catalog.csv', ['sport', 'channels', 'videos', 'long_form_share_of_videos', 'long_form_videos_2026',
                                    'median_long_form_minutes', 'share_of_stored_long_form_views'], out)

    # ---------- Weekly event study by sport ----------
    ev = []
    for sp in TOP_SPORTS:
        chans = {c for c, s in csport.items() if s == sp}
        bstat, cell = week_cells(lf_pick, chans)
        for k in range(-6, 5):
            n_vid = sum(len(v) for v in cell[k].values())
            if n_vid < 15:
                continue
            ccs = {c: (bstat[c][0], bstat[c][1], st.mean(v), bstat[c][2], st.mean(math.log1p(u) for u in v), len(v))
                   for c, v in cell[k].items()}
            lo, hi = boot(ccs)
            ev.append([sp, iso(CHANGE + k * 7), n_vid, len(ccs), estimate(ccs)[0], lo, hi])
    write_csv('sport_event_study.csv', ['sport', 'publish_start', 'videos', 'channels', 'ratio_of_totals', 'rt_lo', 'rt_hi'], ev)

    # ---------- One ratio per channel ----------
    cuts = {
        'switch: read before 08-24 vs published 08-31 on': channel_ratios(lf_pick, pre_r, lambda x: x['P'] >= POST_START),
        'nothing changed: published before vs after 07-01, all read before 08-24':
            channel_ratios(lf_pick, lambda x: pre_r(x) and x['P'] < JUL1, lambda x: pre_r(x) and x['P'] >= JUL1),
    }
    dist, summ = [], []
    for name, ratios in cuts.items():
        vals = list(ratios.values())
        for lo, hi, lab in BINS:
            n = sum(1 for v in vals if lo <= v < hi)
            dist.append([name, lab, n, n / len(vals)])
        for sp in ['All sports'] + TOP_SPORTS:
            v = sorted(r for c, r in ratios.items() if sp == 'All sports' or csport.get(c) == sp)
            if len(v) >= 10:
                summ.append([name, sp, len(v), sum(1 for r in v if r > 1) / len(v), sum(1 for r in v if r >= 1.25) / len(v),
                             st.median(v)])
    write_csv('channel_lift_distribution.csv', ['comparison', 'channel_ratio', 'channels', 'share'], dist)
    write_csv('channel_lift_summary.csv', ['comparison', 'sport', 'channels', 'share_rose', 'share_rose_25pct_plus',
                                           'median_channel_ratio'], summ)
    return dict(catalog=out, sport_event=ev, channel_dist=dist, channel_summary=summ)
