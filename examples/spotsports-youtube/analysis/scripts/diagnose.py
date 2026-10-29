"""diagnose-change: reproduce, decompose, null comparisons, rival tests, sensitivity, stock translation.

Revised 2026-10-28 after analysis review (see skill-outputs/06-analysis-review.md): balanced channel weights,
ratio-of-totals event study with intervals, labeled 2025 placebo ages, Shorts single-channel check, DiD interval,
log-age-normalized later growth, and a stock method that counts post-switch views before the first refetch."""
import math
import random
import statistics as st
from collections import defaultdict

from common import CHANGE, CHANGE_2025, channel_sport, day, iso, write_csv
from metric import (LF_AGE, POST_START, SH_AGE, bootstrap, bootstrap_ppml, estimate, lift, pick_reading, ppml,
                    quantile)

COLS = ['ratio_of_totals', 'rt_lo', 'rt_hi', 'typical_video', 'tv_lo', 'tv_hi', 'channels', 'pre_videos', 'post_videos',
        'pre_age_mean', 'post_age_mean']
JUL1 = day('2026-07-01 00:00:00')
SEP14 = day('2026-09-14 00:00:00')


def row(label, r, extra=()):
    if r is None:
        return [label, *extra] + [''] * len(COLS)
    return [label, *extra] + [r.get(c, '') for c in COLS]


def pre_r(x):
    return x['T'] < CHANGE


def post_r(x):
    return x['P'] >= POST_START


def did(lf_cs, sh_cs, chans, reps=2000, seed=20261028):
    """Long-form ratio over Shorts ratio on one channel set, both resampled together."""
    def one(s):
        a, b = estimate(lf_cs, s), estimate(sh_cs, s)
        return a[0] / b[0], a[1] / b[1]
    point = one(chans)
    rng = random.Random(seed)
    tot, typ = [], []
    for _ in range(reps):
        s = [chans[rng.randrange(len(chans))] for _ in chans]
        t, y = one(s)
        tot.append(t)
        typ.append(y)
    tot.sort()
    typ.sort()
    return dict(ratio_of_totals=point[0], rt_lo=quantile(tot, 0.025), rt_hi=quantile(tot, 0.975),
                typical_video=point[1], tv_lo=quantile(typ, 0.025), tv_hi=quantile(typ, 0.975), channels=len(chans),
                pre_videos=sum(lf_cs[c][0] for c in chans), post_videos=sum(lf_cs[c][5] for c in chans))


def run(rows, rd):
    res = {}
    lf_pick = pick_reading(rd, 0, *LF_AGE)
    sh_pick = pick_reading(rd, 1, *SH_AGE)

    # ---------- Primary (definition v2) and assertions ----------
    lf = lift(rd, 0, LF_AGE, picked=lf_pick)
    sh = lift(rd, 1, SH_AGE, picked=sh_pick)
    g, cs = lf['g'], lf['cs']
    assert max(x['T'] for x in lf_pick if pre_r(x)) < CHANGE
    assert lf['zero_view_pre_channels'] == 0
    write_csv('primary_lift.csv', ['estimate'] + COLS + ['pre_views', 'post_views', 'pre_channels_all', 'post_channels_all'],
              [row('long-form, age 28-30 days', lf) + [lf['pre_views'], lf['post_views'], lf['pre_channels_all'], lf['post_channels_all']],
               row('shorts, age 12-14 days (same estimator)', sh) + [sh['pre_views'], sh['post_views'], sh['pre_channels_all'], sh['post_channels_all']]])
    res['lf'] = lf
    res['sh'] = sh

    # ---------- Reproduce: pooled vs within-channel ----------
    def pooled(pick):
        a = [x['views'] for x in pick if pre_r(x)]
        b = [x['views'] for x in pick if post_r(x)]
        ga = math.exp(st.mean(math.log1p(v) for v in a))
        gb = math.exp(st.mean(math.log1p(v) for v in b))
        return [len(a), len({x['channel'] for x in pick if pre_r(x)}), st.mean(a), st.median(a), ga,
                len(b), len({x['channel'] for x in pick if post_r(x)}), st.mean(b), st.median(b), gb,
                st.mean(b) / st.mean(a), st.median(b) / st.median(a), gb / ga]
    rep = [['long-form 28-30d, pooled all channels'] + pooled(lf_pick),
           ['shorts 12-14d, pooled all channels'] + pooled(sh_pick)]
    write_csv('reproduce_pooled.csv', ['comparison', 'pre_n', 'pre_channels', 'pre_mean', 'pre_median', 'pre_geomean',
                                       'post_n', 'post_channels', 'post_mean', 'post_median', 'post_geomean',
                                       'ratio_mean', 'ratio_median', 'ratio_geomean'], rep)
    res['reproduce'] = rep

    # ---------- Decomposition: within-channel rate vs channel mix (mean views per video) ----------
    pre_c = defaultdict(list)
    post_c = defaultdict(list)
    for x in lf_pick:
        if pre_r(x):
            pre_c[x['channel']].append(x['views'])
        elif post_r(x):
            post_c[x['channel']].append(x['views'])
    common = set(pre_c) & set(post_c)
    npre = sum(len(pre_c[c]) for c in common)
    npost = sum(len(post_c[c]) for c in common)
    r_b = {c: st.mean(pre_c[c]) for c in common}
    r_a = {c: st.mean(post_c[c]) for c in common}
    w_b = {c: len(pre_c[c]) / npre for c in common}
    w_a = {c: len(post_c[c]) / npost for c in common}
    mean_b = sum(w_b[c] * r_b[c] for c in common)
    mean_a = sum(w_a[c] * r_a[c] for c in common)
    within = sum(w_b[c] * (r_a[c] - r_b[c]) for c in common)
    mix_c = {c: (w_a[c] - w_b[c]) * r_a[c] for c in common}
    mix = sum(mix_c.values())
    top_mix = min(mix_c, key=mix_c.get)
    all_pre = [v for c in pre_c for v in pre_c[c]]
    all_post = [v for c in post_c for v in post_c[c]]
    dec = [['pooled mean, all channels, pre', st.mean(all_pre)], ['pooled mean, all channels, post', st.mean(all_post)],
           ['common-support channels', len(common)],
           ['entry: post-only channels, videos', sum(len(post_c[c]) for c in set(post_c) - common)],
           ['exit: pre-only channels, videos', sum(len(pre_c[c]) for c in set(pre_c) - common)],
           ['common-support mean, pre', mean_b], ['common-support mean, post', mean_a],
           ['total change (common support)', mean_a - mean_b],
           ['within-channel term sum(w_pre*(r_post-r_pre))', within],
           ['mix term sum((w_post-w_pre)*r_post), includes interaction', mix],
           ['within + mix (check)', within + mix],
           ['within-channel share of change', within / (mean_a - mean_b)],
           ['largest single-channel mix contribution', mix_c[top_mix]],
           ['  that channel: pre videos', len(pre_c[top_mix])], ['  that channel: post videos', len(post_c[top_mix])],
           ['mix term without that channel', mix - mix_c[top_mix]]]
    write_csv('decomposition_channel_mix.csv', ['item', 'value'], dec)
    res['decomp'] = dec

    # ---------- Event study by publish day and week, against each channel's pre-group level ----------
    # Both measures use the balanced weight between a channel's pre group and its videos in the cell.
    # Pre-period cells are part of the baseline they are compared with.
    ev = []
    for fmt, pick in ((0, lf_pick), (1, sh_pick)):
        base = defaultdict(list)
        for x in pick:
            if pre_r(x):
                base[x['channel']].append(x['views'])
        bstat = {c: (len(v), st.mean(v), st.mean(math.log1p(u) for u in v)) for c, v in base.items()}
        for unit, size in (('day', 1), ('week', 7)):
            cell = defaultdict(lambda: defaultdict(list))
            side = defaultdict(lambda: [0, 0])
            for x in pick:
                if x['channel'] in bstat:
                    k = math.floor((x['P'] - CHANGE) / size)
                    cell[k][x['channel']].append(x['views'])
                    side[k][0 if pre_r(x) else 1] += 1
            for k in sorted(cell):
                n_vid = sum(len(v) for v in cell[k].values())
                if n_vid < 20:
                    continue
                ccs = {c: (bstat[c][0], bstat[c][1], st.mean(v), bstat[c][2], st.mean(math.log1p(u) for u in v), len(v))
                       for c, v in cell[k].items()}
                rt, tv = estimate(ccs)
                if unit == 'week':
                    (rl, rh), (tl, th) = bootstrap(ccs, reps=500)
                else:
                    rl = rh = tl = th = ''
                ev.append(['long-form 28-30d' if fmt == 0 else 'shorts 12-14d', unit, k, iso(CHANGE + k * size),
                           n_vid, len(ccs), side[k][0], side[k][1], rt, rl, rh, tv, tl, th])
    write_csv('event_study.csv', ['series', 'unit', 'publish_offset', 'publish_start', 'videos', 'channels',
                                  'read_before_change', 'read_after_change', 'ratio_of_totals', 'rt_lo', 'rt_hi',
                                  'typical_video', 'tv_lo', 'tv_hi'], ev)
    res['event'] = ev

    # ---------- Null comparisons: same estimator where nothing changed ----------
    nulls = []
    r = lift(rd, 0, LF_AGE, picked=lf_pick, pre_rule=lambda x: pre_r(x) and x['P'] < JUL1,
             post_rule=lambda x: pre_r(x) and x['P'] >= JUL1)
    nulls.append(row('long-form 28-30d: published before vs after 2026-07-01, all read before change', r, ('yes',)))
    r = lift(rd, 0, LF_AGE, picked=lf_pick, pre_rule=lambda x: POST_START <= x['P'] < SEP14,
             post_rule=lambda x: x['P'] >= SEP14)
    nulls.append(row('long-form 28-30d: published 2026-08-31..09-13 vs 09-14 on, all after change', r, ('yes',)))
    r = lift(rd, 1, SH_AGE, picked=sh_pick, pre_rule=lambda x: pre_r(x) and x['P'] < day('2026-05-01 00:00:00'),
             post_rule=lambda x: pre_r(x) and x['P'] >= day('2026-05-01 00:00:00'))
    nulls.append(row('shorts 12-14d: published before vs after 2026-05-01, all read before change', r, ('yes',)))
    nulls.append(row('shorts 12-14d across the 2026 switch (control; calendar windows differ from long-form)', sh, ('yes',)))
    sh_top = max(sh['g'], key=lambda c: sum(sh['g'][c][0]))
    r = lift(rd, 1, SH_AGE, picked=[x for x in sh_pick if x['channel'] != sh_top])
    nulls.append(row('shorts across the switch, without the one channel holding the largest share of pre views', r, ('no, check',)))
    # Year-earlier placebo on lifetime counts read in June 2026. Not age-matched: pre videos are about 329 days old
    # at reading and post videos about 267, so it is reported but kept out of the null spread.
    june = [x for x in rd if x['kind'] == 'last' and pre_r(x) and x['P'] < day('2026-01-01 00:00:00')]
    for fmt, name in ((0, 'long-form'), (1, 'shorts')):
        pick = [x for x in june if x['fmt'] == fmt]
        r = lift(rd, fmt, None, picked=pick, pre_rule=lambda x: x['P'] < CHANGE_2025 - 30,
                 post_rule=lambda x: CHANGE_2025 + 7 <= x['P'] < CHANGE_2025 + 37)
        nulls.append(row(f'{name} 2025 placebo, unequal ages: lifetime count last read before 2026-08-24; published 2025-07-01..07-24 vs 2025-08-31..09-29',
                         r, ('no, ages differ',)))
    write_csv('null_comparisons.csv', ['comparison', 'in_null_spread'] + COLS, nulls)
    res['nulls'] = nulls
    res['sh_top'] = sh_top

    # ---------- Sensitivity ----------
    sens = [row('primary (balanced channel weights)', lf)]
    v1 = lift(rd, 0, LF_AGE, picked=lf_pick, weights='pre')
    sens.append(row('weights = pre-group video count (version 1 primary)', v1))
    sens.append(row('equal weight per channel', lift(rd, 0, LF_AGE, picked=lf_pick, weights='equal')))
    pp_lo, pp_hi = bootstrap_ppml(cs)
    sens.append(row('Poisson (PPML) with channel fixed effects, level views', dict(
        ratio_of_totals=ppml(cs), rt_lo=pp_lo, rt_hi=pp_hi, channels=lf['channels'], pre_videos=lf['pre_videos'],
        post_videos=lf['post_videos'], pre_age_mean=lf['pre_age_mean'], post_age_mean=lf['post_age_mean'])))
    for label, start in (('post starts 2026-08-24 (no buffer)', CHANGE), ('post starts 2026-08-27', CHANGE + 3),
                         ('post starts 2026-09-07', CHANGE + 14)):
        sens.append(row(label, lift(rd, 0, LF_AGE, picked=lf_pick, post_rule=lambda x, s=start: x['P'] >= s)))
    for label, age in (('age window 27-31 days', (27, 31)), ('age window 28.5-29.5 days', (28.5, 29.5)),
                       ('age window 20-28 days (post readings about 2 days younger)', (20, 28)),
                       ('age window 26-28 days (ages matched)', (26, 28))):
        sens.append(row(label, lift(rd, 0, age)))
    sens.append(row('pre group: published 2026-07-01 or later only', lift(
        rd, 0, LF_AGE, picked=lf_pick, pre_rule=lambda x: pre_r(x) and x['P'] >= JUL1)))
    sens.append(row('post group: published 2026-09-14 or later only', lift(
        rd, 0, LF_AGE, picked=lf_pick, post_rule=lambda x: x['P'] >= SEP14)))
    bad = {r_['video_key'] for r_ in rows if (r_['T1'] is not None and r_['T1'] < r_['I']) or
           (r_['T2'] is not None and r_['T2'] < r_['I'])}
    sens.append(row('drop readings stamped before ingestion', lift(rd, 0, LF_AGE, picked=[x for x in lf_pick if x['video'] not in bad])))
    sens.append(row('drop long-form at or under 60 seconds', lift(rd, 0, LF_AGE, picked=[x for x in lf_pick if (x['dur'] or 0) > 60])))
    sens.append(row('drop durations over 1 day or null', lift(rd, 0, LF_AGE, picked=[x for x in lf_pick if x['dur'] and x['dur'] <= 86400])))
    sens.append(row('post group uses only earlier (prev) readings, like the pre group',
                    lift(rd, 0, LF_AGE, picked=[x for x in lf_pick if x['kind'] == 'prev'])))
    top = set(sorted(cs, key=lambda c: -cs[c][0] * cs[c][1])[:max(1, len(cs) // 100)])
    sens.append(row('drop top 1% channels by pre views', lift(rd, 0, LF_AGE, picked=[x for x in lf_pick if x['channel'] not in top])))
    lev = max(cs, key=lambda c: cs[c][0] * cs[c][2])
    sens.append(row('drop the one channel with the largest share of the version-1 numerator',
                    lift(rd, 0, LF_AGE, picked=[x for x in lf_pick if x['channel'] != lev])))
    sh_cs = sh['cs']
    both = sorted(set(cs) & set(sh_cs))
    sens.append(row('long-form / shorts ratio, channels with both (diff-in-diff; windows differ)', did(cs, sh_cs, both)))
    sens.append(row('  same, without the dominant Shorts channel', did(cs, sh_cs, [c for c in both if c != sh_top])))
    write_csv('sensitivity.csv', ['variant'] + COLS, sens)
    res['sens'] = sens

    # ---------- Rival tests: by sport (channel modal sport), duration, channel size; selection ----------
    csport = channel_sport(rows)
    het = []
    for sp in sorted({csport.get(c) for c in cs}, key=lambda s: (-sum(1 for c in cs if csport.get(c) == s), s or '')):
        chans = {c for c in cs if csport.get(c) == sp}
        if len(chans) >= 10:
            het.append(row(sp, lift(rd, 0, LF_AGE, picked=lf_pick, channels=chans, reps=1000), ('sport',)))
    for sp in sorted({csport.get(c) for c in sh_cs}, key=lambda s: (-sum(1 for c in sh_cs if csport.get(c) == s), s or '')):
        chans = {c for c in sh_cs if csport.get(c) == sp}
        if len(chans) >= 10:
            het.append(row(sp, lift(rd, 1, SH_AGE, picked=sh_pick, channels=chans, reps=1000), ('shorts sport',)))
    for lo, hi, lab in DURATION_BANDS:
        pick = [x for x in lf_pick if lo < (x['dur'] or 0) <= hi or (lo == 0 and not x['dur'])]
        het.append(row(lab, lift(rd, 0, LF_AGE, picked=pick, reps=1000), ('duration',)))
    # Channel size. Sorting on the pre-group mean itself builds in regression to the mean,
    # so size is also measured independently: median lifetime count of the channel's long-form videos
    # published 2026-01-01..2026-04-30 (videos in neither group).
    order = sorted(cs, key=lambda c: cs[c][1])
    k = len(order) // 3
    for i, lab in enumerate(('smallest third', 'middle third', 'largest third')):
        chans = set(order[i * k:(i + 1) * k] if i < 2 else order[2 * k:])
        het.append(row(lab, lift(rd, 0, LF_AGE, picked=lf_pick, channels=chans, reps=1000),
                       ('channel size by pre-group mean (biased by regression to the mean)',)))
    terciles = size_terciles(rows, cs)
    for lab, chans in terciles:
        het.append(row(lab, lift(rd, 0, LF_AGE, picked=lf_pick, channels=chans, reps=1000),
                       ('channel size by Jan-Apr 2026 median lifetime views (independent)',)))
    for lab, chans in terciles:
        het.append(row(lab, lift(rd, 0, LF_AGE, picked=lf_pick, channels=chans, reps=1000,
                                 pre_rule=lambda x: pre_r(x) and x['P'] < JUL1, post_rule=lambda x: pre_r(x) and x['P'] >= JUL1),
                       ('null (pre-period split) by independent channel size',)))
    write_csv('lift_by_segment.csv', ['label', 'segment_type'] + COLS, het)
    res['het'] = het
    res['terciles'] = terciles

    # selection: within channel, pre-period videos with vs without a pre-change age-29 reading, later lifetime count
    cov = {x['video'] for x in lf_pick if pre_r(x)}
    gsel = defaultdict(lambda: ([], []))
    for r_ in rows:
        if r_['is_yt_short'] != 0 or r_['view_count'] is None or r_['T2'] is None:
            continue
        if not (CHANGE - 70 <= r_['P'] < CHANGE - 29) or r_['T2'] < CHANGE + 1:
            continue
        gsel[r_['channel_key']][0 if r_['video_key'] in cov else 1].append(math.log1p(r_['view_count']))
    bothc = [c for c, (a, b) in gsel.items() if a and b]
    d = [st.mean(gsel[c][0]) - st.mean(gsel[c][1]) for c in bothc]
    write_csv('selection_check.csv', ['item', 'value'],
              [['channels with both covered and uncovered pre-period videos', len(bothc)],
               ['geometric ratio, covered / uncovered, later lifetime count', math.exp(st.mean(d))],
               ['median within-channel log difference', st.median(d)]])

    # ---------- Later growth: views after age 29, when that growth happens under the new rule ----------
    # Elapsed windows cannot be matched (the old-rule-base group has no second reading within 34 days of the first),
    # so growth is also expressed per unit of log age: k = ln(aggregate growth) / ln(median age 2 / median age 1).
    pairs = []
    for r_ in rows:
        if r_['is_yt_short'] != 0 or r_['T1'] is None or r_['T2'] is None or r_['prev_view_count'] is None or r_['view_count'] is None:
            continue
        a1 = r_['T1'] - r_['P']
        a2 = r_['T2'] - r_['P']
        if 27 <= a1 < 31 and 55 <= a2 < 70 and r_['prev_view_count'] > 0:
            pairs.append((r_, a1, a2))
    srows = []
    for lab, sel in (('first 29 days old rule, later growth new rule (read at 29 before switch)',
                      [p for p in pairs if p[0]['T1'] < CHANGE and p[0]['T2'] >= CHANGE + 1]),
                     ('first 15+ days old rule, read at 29 just after switch (published 2026-07-26..08-08)',
                      [p for p in pairs if p[0]['T1'] >= CHANGE and CHANGE - 29 <= p[0]['P'] < CHANGE - 15]),
                     ('all new rule (published on or after 2026-08-24)',
                      [p for p in pairs if p[0]['P'] >= CHANGE])):
        if not sel:
            continue
        gr = [(p[0]['view_count'] + 1) / (p[0]['prev_view_count'] + 1) for p in sel]
        v1s = sum(p[0]['prev_view_count'] for p in sel)
        v2s = sum(p[0]['view_count'] for p in sel)
        agg = v2s / v1s
        big = max(sel, key=lambda p: p[0]['view_count'] - p[0]['prev_view_count'])[0]
        agg_wo = (v2s - big['view_count']) / (v1s - big['prev_view_count'])
        m1, m2 = st.median(p[1] for p in sel), st.median(p[2] for p in sel)
        srows.append([lab, len(sel), len({p[0]['channel_key'] for p in sel}), m1, m2, m2 - m1,
                      st.median(gr), math.exp(st.mean(math.log(x) for x in gr)), agg, agg_wo,
                      math.log(agg) / math.log(m2 / m1)])
    write_csv('straddler_growth.csv', ['group', 'videos', 'channels', 'median_age_1', 'median_age_2', 'median_elapsed_days',
                                       'median_growth', 'geomean_growth', 'aggregate_growth',
                                       'aggregate_growth_without_largest_video', 'growth_per_log_age'], srows)
    res['straddle'] = srows

    # ---------- Ranking illustration: a mixed-vintage top list at day 29, raw vs scaled ----------
    R = lf['ratio_of_totals']
    pool = [x for x in lf_pick if x['channel'] in g and (pre_r(x) or post_r(x))]
    share_post = sum(1 for x in pool if post_r(x)) / len(pool)
    span = {s: (iso(min(x['P'] for x in pool if f(x))), iso(max(x['P'] for x in pool if f(x))))
            for s, f in (('pre', pre_r), ('post', post_r))}
    rk = []
    for n in (100, 1000, 5000):
        raw = sorted(pool, key=lambda x: -x['views'])[:n]
        adj = sorted(pool, key=lambda x: -(x['views'] / R if post_r(x) else x['views']))[:n]
        rk.append([n, len(pool), share_post, sum(1 for x in raw if post_r(x)) / n, sum(1 for x in adj if post_r(x)) / n,
                   R, f"{span['pre'][0]}..{span['pre'][1]}", f"{span['post'][0]}..{span['post'][1]}"])
    write_csv('ranking_illustration.csv', ['top_n', 'videos_in_pool', 'post_share_of_pool', 'post_share_of_top_raw',
                                           'post_share_of_top_scaled_by_1_over_R', 'R', 'pre_published', 'post_published'], rk)
    res['rank'] = rk

    # ---------- Stock translation: how much the catalog's stored long-form total moved ----------
    res['stock'] = stock(rows, lf)
    return res


DURATION_BANDS = [(0, 60, '<=60s'), (60, 180, '61-180s'), (180, 600, '3-10 min'), (600, 1200, '10-20 min'),
                  (1200, 3600, '20-60 min'), (3600, 10 ** 9, '>60 min')]


def size_terciles(rows, cs):
    ind = defaultdict(list)
    for r_ in rows:
        if r_['is_yt_short'] == 0 and r_['view_count'] is not None and day('2026-01-01 00:00:00') <= r_['P'] < day('2026-05-01 00:00:00'):
            ind[r_['channel_key']].append(r_['view_count'])
    order = sorted((c for c in cs if c in ind), key=lambda c: st.median(ind[c]))
    k = len(order) // 3
    return [(lab, set(order[i * k:(i + 1) * k] if i < 2 else order[2 * k:]))
            for i, lab in enumerate(('smallest third', 'middle third', 'largest third'))]


def stock(rows, lf):
    """Modeled rule-added views in today's stored long-form total. Scenarios, not bounds.
    Post-switch accrual A per video (V1, V2 = earlier and last counts at T1 < T2; P = publish time):
      published on/after 2026-08-24: A = V2.
      published before, T1 before the switch, T2 after: A = (V2 - V1) * (T2 - switch) / (T2 - T1)
        (time share; overstates for young videos whose rate is falling).
      published before, T1 on or after the switch (version 1 missed the views between the switch and T1):
        flat_rate   A = (V2 - V1) + min(V1, rate(T1..T2) * (T1 - switch))   (refetch-to-refetch rate held back to the switch)
        even_spread A = (V2 - V1) + V1 * (T1 - switch) / (T1 - P)            (first count spread evenly from publish)
      otherwise: A = V2 * (aggregate A/V of videos in the same publish month that have pairs), per scenario.
    Neither scenario bounds the truth: each assumes a shape for the unobserved accrual curve, and for 1,183 paired
    videos flat_rate exceeds even_spread (review_checks.csv).
    identified_min / identified_max: the widest accrual the timestamps allow if counts never fall and were not
    restated. Stored count read before the switch: 0. Published on/after the switch: V2. Ordered pair, both readings
    after the switch: [V2 - V1, V2]. Pair straddling the switch: [0, V2 - V1]. No usable pair, read after: [0, V2].
    Rule-added = A * (1 - 1/R), one common factor R for every view. Stock lift = S / (S - added) - 1."""
    lfr = [r for r in rows if r['is_yt_short'] == 0 and r['view_count'] is not None]
    scen = ('flat_rate', 'even_spread')
    est = {b: {} for b in scen + ('identified_min', 'identified_max')}
    mnum = {b: defaultdict(float) for b in scen}
    mden = defaultdict(float)
    for r in lfr:
        k, v2 = r['video_key'], r['view_count']
        T1, T2, v1 = r['T1'], r['T2'], r['prev_view_count']
        t_last = T2 if T2 is not None else r['I']
        # identified range
        if r['P'] >= CHANGE:
            lo_i = hi_i = v2
        elif t_last < CHANGE:
            lo_i = hi_i = 0
        elif T2 is not None and T1 is not None and v1 is not None and T1 < T2 and 0 <= v1 <= v2:
            lo_i, hi_i = (v2 - v1, v2) if T1 >= CHANGE else (0, v2 - v1)
        else:
            lo_i, hi_i = 0, v2
        est['identified_min'][k], est['identified_max'][k] = lo_i, hi_i
        # scenarios
        if r['P'] >= CHANGE:
            est['flat_rate'][k] = est['even_spread'][k] = v2
            continue
        if T1 is None or v1 is None or T2 is None or T2 <= CHANGE or T2 <= T1:
            continue
        inc = max(0, v2 - v1)
        if T1 < CHANGE:
            lo = hi = inc * (T2 - CHANGE) / (T2 - T1)
        else:
            lo = inc + min(v1, inc / (T2 - T1) * (T1 - CHANGE))
            hi = inc + (v1 * (T1 - CHANGE) / (T1 - r['P']) if T1 > r['P'] else 0)
        m = r['published_at'][:7]
        for b, a in zip(scen, (lo, hi)):
            est[b][k] = a
            mnum[b][m] += a
        mden[m] += v2
    for r in lfr:
        m = r['published_at'][:7]
        T2 = r['T2'] if r['T2'] is not None else r['I']
        for b in scen:
            if r['video_key'] not in est[b]:
                share = mnum[b][m] / mden[m] if mden[m] and T2 > CHANGE else 0.0
                est[b][r['video_key']] = r['view_count'] * share
    out = []
    groups_ = [('published on/after 2026-08-24', lambda r: r['P'] >= CHANGE),
               ('published 2026-07-26..08-23', lambda r: CHANGE - 29 <= r['P'] < CHANGE),
               ('published 2026-01-01..07-25', lambda r: day('2026-01-01 00:00:00') <= r['P'] < CHANGE - 29),
               ('published 2025', lambda r: r['P'] < day('2026-01-01 00:00:00')),
               ('all long-form', lambda r: True)]
    for b in est:
        for R, rl in ((lf['ratio_of_totals'], 'point'), (lf['rt_lo'], 'low'), (lf['rt_hi'], 'high')):
            for lab, f in groups_:
                sel = [r for r in lfr if f(r)]
                s = sum(r['view_count'] for r in sel)
                a = sum(est[b][r['video_key']] for r in sel)
                added = a * (1 - 1 / R)
                out.append([lab, b, rl, R, len(sel), s, a, a / s if s else 0, added, s / (s - added) - 1 if s else 0])
    write_csv('stock_translation.csv', ['group', 'accrual', 'R_used', 'R', 'videos', 'stored_views',
                                        'est_post_switch_views', 'post_switch_share', 'rule_added_views',
                                        'lift_on_stored_total'], out)
    return out
