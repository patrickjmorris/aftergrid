"""Checks added in response to analysis review (skill-outputs/06-analysis-review.md).

quantile_ratios.csv     post / pre views at matched percentiles, both sides on balanced channel weights (opus 1)
transition_lift.csv     day-29 lift for videos published in the weeks around the switch (opus 2, gemini 1)
segment_dispersion.csv  spread of segment lifts at the switch vs at two cutovers where nothing changed (opus 4, sol 5)
review_checks.csv       single-number checks: one factor on current counts (sol 1), residual after one factor (sol 2),
                        counterfactual needed to reach 25% (sol 3), stored-total lift of the transition cohort modeled
                        from its day-29 cohort ratios (gemini 1), stored-total scenarios that cross (round 2, finding 2)
within_week_contrast.csv  round 2, finding 1: Thursday-Sunday vs Monday-Wednesday publishes inside each publish week,
                        same channels, day-29 readings; and 08-27..08-30 vs 08-24..08-26 directly
trial_rank_check.csv    round 2, finding 1: the trial's success check at day 29. Percentile within ranking cohort
                        (transition band 07-27..08-26 left out, 08-24 week split at 08-27), then each sport's mean
                        percentile shift across the switch vs across two cutovers where nothing changed
"""
import math
import statistics as st
from collections import defaultdict

from common import CHANGE, channel_sport, day, iso, write_csv
from metric import LF_AGE, POST_START, channel_stats, estimate, bootstrap, groups, lift, pick_reading, weight
from diagnose import DURATION_BANDS, JUL1, SEP14, pre_r, post_r, size_terciles


def wquantile(pairs, p):
    total = sum(w for _, w in pairs)
    acc = 0.0
    for v, w in pairs:
        acc += w
        if acc >= p * total:
            return v
    return pairs[-1][0]


def run(rows, rd, res):
    lf = res['lf']
    g, cs = lf['g'], lf['cs']
    R, T = lf['ratio_of_totals'], lf['typical_video']
    lf_pick = pick_reading(rd, 0, *LF_AGE)

    # ---------- Percentiles, both sides weighted to the same channel weights ----------
    pre_w, post_w = [], []
    for c, (a, b) in g.items():
        w = weight(len(a), len(b), 'balanced')
        pre_w += [(v, w / len(a)) for v in a]
        post_w += [(v, w / len(b)) for v in b]
    pre_w.sort()
    post_w.sort()
    qr = []
    for p in (0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99):
        a, b = wquantile(pre_w, p), wquantile(post_w, p)
        qr.append([p, a, b, b / a if a else ''])
    write_csv('quantile_ratios.csv', ['percentile', 'pre_views', 'post_views', 'post_over_pre'], qr)

    # ---------- Day-29 lift for publish windows around the switch ----------
    tr = []
    for lab, lo, hi in (('2026-07-27..08-09', -28, -14), ('2026-08-10..08-19', -14, -4), ('2026-08-20..08-23', -4, 0),
                        ('2026-08-24..08-26', 0, 3), ('2026-08-27..08-30', 3, 7), ('2026-08-31 on (primary post group)', 7, 99)):
        r = lift(rd, 0, LF_AGE, picked=lf_pick, reps=1000,
                 post_rule=lambda x, lo=lo, hi=hi: CHANGE + lo <= x['P'] < CHANGE + hi and x['T'] >= CHANGE)
        tr.append([lab, r['ratio_of_totals'], r['rt_lo'], r['rt_hi'], r['typical_video'], r['tv_lo'], r['tv_hi'],
                   r['channels'], r['post_videos']])
    write_csv('transition_lift.csv', ['published', 'ratio_of_totals', 'rt_lo', 'rt_hi', 'typical_video', 'tv_lo', 'tv_hi',
                                      'channels', 'videos'], tr)
    res['transition'] = tr
    # Stored-total lift for videos published 2026-07-26..08-23, modeled from their cohort's day-29 ratio (gemini 1):
    # rule-added = V1 * (1 - 1/R_window) + (V2 - V1) * (1 - 1/R), window ratios floored at 1.
    # A model, not a measurement: no old-rule count is observed. 'low' and 'high' plug in the cohort interval
    # endpoints; that range omits uncertainty in the accrual model and in the common-factor assumption.
    win = ((-29, -14, tr[0]), (-14, -4, tr[1]), (-4, 0, tr[2]))
    measured = []
    for k, label in ((1, 'point'), (2, 'low'), (3, 'high')):
        s = added = 0.0
        n = 0
        for r in rows:
            if r['is_yt_short'] != 0 or r['view_count'] is None or not (CHANGE - 29 <= r['P'] < CHANGE):
                continue
            if r['T1'] is None or r['prev_view_count'] is None or r['T2'] is None or r['T1'] < CHANGE or r['T2'] <= r['T1']:
                continue
            rw = next(max(1.0, t[k]) for lo, hi, t in win if CHANGE + lo <= r['P'] < CHANGE + hi)
            rr = {1: R, 2: lf['rt_lo'], 3: lf['rt_hi']}[k]
            added += r['prev_view_count'] * (1 - 1 / rw) + max(0, r['view_count'] - r['prev_view_count']) * (1 - 1 / rr)
            s += r['view_count']
            n += 1
        measured.append((label, n, s, added / (s - added)))
    res['transition_stock'] = measured

    # ---------- Segment spread at the switch vs where nothing changed ----------
    csport = channel_sport(rows)
    cutovers = (('switch: read before 08-24 vs published 08-31 on', pre_r, post_r),
                ('placebo: published before vs after 07-01, all read before 08-24',
                 lambda x: pre_r(x) and x['P'] < JUL1, lambda x: pre_r(x) and x['P'] >= JUL1),
                ('placebo: published 08-31..09-13 vs 09-14 on', lambda x: POST_START <= x['P'] < SEP14,
                 lambda x: x['P'] >= SEP14))
    sports = sorted({csport.get(c) for c in cs if sum(1 for d in cs if csport.get(d) == csport.get(c)) >= 10})
    dims = {'sport': [(s, lambda x, s=s: csport.get(x['channel']) == s) for s in sports],
            'duration': [(lab, lambda x, lo=lo, hi=hi: lo < (x['dur'] or 0) <= hi or (lo == 0 and not x['dur']))
                         for lo, hi, lab in DURATION_BANDS],
            'channel size (independent)': [(lab, lambda x, ch=ch: x['channel'] in ch) for lab, ch in size_terciles(rows, cs)]}
    sd = []
    for dim, segs in dims.items():
        for cut, a, b in cutovers:
            vals = []
            for lab, f in segs:
                gg, _, _ = groups([x for x in lf_pick if f(x)], a, b)
                if len(gg) >= 10:
                    vals.append((lab, *estimate(channel_stats(gg))))
            for k, name in ((1, 'ratio_of_totals'), (2, 'typical_video')):
                logs = [math.log(v[k]) for v in vals]
                lo_, hi_ = min(vals, key=lambda v: v[k]), max(vals, key=lambda v: v[k])
                sd.append([dim, cut, name, len(vals), st.stdev(logs), hi_[k] / lo_[k],
                           f'{lo_[0]} {lo_[k]:.2f}', f'{hi_[0]} {hi_[k]:.2f}'])
    write_csv('segment_dispersion.csv', ['dimension', 'cutover', 'measure', 'segments', 'sd_log_ratio', 'max_over_min',
                                         'lowest', 'highest'], sd)
    res['dispersion'] = sd

    # ---------- Round 2, finding 1: contrast inside each publish week ----------
    # Thursday-Sunday vs Monday-Wednesday publishes of the same channels, day-29 readings, balanced weights.
    # The 2026-08-24 week is the only week that straddles the observed step (08-26 to 08-27 publishes).
    ww = []
    r = lift(None, 0, LF_AGE, picked=lf_pick, reps=1000, pre_rule=lambda x: CHANGE <= x['P'] < CHANGE + 3,
             post_rule=lambda x: CHANGE + 3 <= x['P'] < CHANGE + 7)
    ww.append(['2026-08-24', 'direct: 08-27..08-30 vs 08-24..08-26', 'straddles the step', r['ratio_of_totals'], r['rt_lo'],
               r['rt_hi'], r['typical_video'], r['tv_lo'], r['tv_hi'], r['channels'], r['pre_videos'], r['post_videos']])
    for k in range(-10, 5):
        s0 = CHANGE + 7 * k
        r = lift(None, 0, LF_AGE, picked=lf_pick, reps=500, pre_rule=lambda x, s0=s0: s0 <= x['P'] < s0 + 3,
                 post_rule=lambda x, s0=s0: s0 + 3 <= x['P'] < s0 + 7)
        if r is None or r['channels'] < 30:
            continue
        regime = ('old rule at day 29' if k <= -5 else 'transition band' if k <= -1 else
                  'straddles the step' if k == 0 else 'new rule at day 29')
        ww.append([iso(s0), 'Thu-Sun vs Mon-Wed', regime, r['ratio_of_totals'], r['rt_lo'], r['rt_hi'],
                   r['typical_video'], r['tv_lo'], r['tv_hi'], r['channels'], r['pre_videos'], r['post_videos']])
    write_csv('within_week_contrast.csv', ['week_start', 'comparison', 'regime', 'ratio_of_totals', 'rt_lo', 'rt_hi',
                                           'typical_video', 'tv_lo', 'tv_hi', 'channels', 'early_videos', 'late_videos'], ww)
    res['within_week'] = ww

    # ---------- Round 2, finding 1: the trial's success check at day 29 ----------
    # Ranking cohorts: Monday-start publish weeks; the transition band (published 07-27..08-26, day-29 counts that mix
    # the two rules) is left out; 08-27..08-30 is its own cohort. Percentile = mid-rank of day-29 views within cohort.
    # Per channel: mean percentile on each side; balanced weight. Per sport: weighted mean of its channels' shifts.
    # Pass if the spread of sport shifts across the switch is no wider than across both cutovers where nothing changed.
    band = (CHANGE - 28, CHANGE + 3)

    def cohort(x):
        if band[0] <= x['P'] < band[1]:
            return None
        return 'split' if CHANGE + 3 <= x['P'] < CHANGE + 7 else math.floor((x['P'] - CHANGE) / 7)

    coh = defaultdict(list)
    for x in lf_pick:
        if cohort(x) is not None:
            coh[cohort(x)].append(x)
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
    trial_cuts = (('switch: read before 08-24 vs published 08-27 on', pre_r, lambda x: x['P'] >= CHANGE + 3),
                  ('null: published before vs after 07-01, all read before 08-24',
                   lambda x: pre_r(x) and x['P'] < JUL1, lambda x: pre_r(x) and x['P'] >= JUL1),
                  ('null: published 08-31..09-13 vs 09-14 on', lambda x: POST_START <= x['P'] < SEP14,
                   lambda x: x['P'] >= SEP14))
    tc = []
    sports_used = None
    for lab, a, b in trial_cuts:
        gg = defaultdict(lambda: ([], []))
        for x in lf_pick:
            if x['video'] in pct:
                if a(x):
                    gg[x['channel']][0].append(pct[x['video']])
                elif b(x):
                    gg[x['channel']][1].append(pct[x['video']])
        shift = {c: (st.mean(v[1]) - st.mean(v[0]), weight(len(v[0]), len(v[1]), 'balanced'))
                 for c, v in gg.items() if v[0] and v[1]}
        by = defaultdict(list)
        for c, dw in shift.items():
            by[csport.get(c)].append(dw)
        if sports_used is None:
            sports_used = sorted(s_ for s_, v in by.items() if len(v) >= 10)
        sp = {s_: sum(d * w for d, w in by[s_]) / sum(w for _, w in by[s_]) for s_ in sports_used if by[s_]}
        wt = sum(w for _, w in shift.values())
        m_ = sum(d * w for d, w in shift.values()) / wt
        sd_ch = math.sqrt(sum(w * (d - m_) ** 2 for d, w in shift.values()) / wt)
        lo_, hi_ = min(sp, key=sp.get), max(sp, key=sp.get)
        tc.append([lab, len(shift), len(sp), st.stdev(sp.values()), f'{lo_} {sp[lo_]:+.1f}', f'{hi_} {sp[hi_]:+.1f}', sd_ch,
                   ' '.join(f'{k_}:{v:+.1f}' for k_, v in sorted(sp.items()))])
    write_csv('trial_rank_check.csv', ['cutover', 'channels', 'sports', 'sd_sport_shift_pct_points', 'lowest_sport',
                                       'highest_sport', 'weighted_sd_channel_shift_pct_points', 'sport_shifts'], tc)
    res['trial_check'] = tc

    # ---------- Single-number checks ----------
    chk = []
    # sol 1: one factor applied to current lifetime counts of videos published before the switch
    old = [r for r in rows if r['is_yt_short'] == 0 and r['view_count'] is not None and r['P'] < CHANGE]
    mixed = [r for r in old if r['T2'] is not None and r['T2'] >= CHANGE]
    chk.append(['long-form videos published before 08-24', len(old), ''])
    chk.append(['  of which last read on or after 08-24 (current count includes new-rule views)', len(mixed),
                sum(r['view_count'] for r in mixed)])
    two = [r for r in old if r['P'] < CHANGE - 4 and r['T1'] is not None and r['T1'] >= CHANGE and r['T2'] is not None
           and r['T2'] > r['T1'] and r['prev_view_count'] is not None and 0 <= r['prev_view_count'] <= r['view_count']]
    over = [(R - 1) * (r['view_count'] - r['prev_view_count']) / (R * r['prev_view_count'] + r['view_count'] - r['prev_view_count'])
            for r in two if r['view_count'] > 0]
    chk.append(['published before 08-20, both readings on or after 08-24: videos / views added between readings',
                len(two), sum(r['view_count'] - r['prev_view_count'] for r in two)])
    chk.append(['  of which x R overstates the new-rule count by more than 25% (lower bound)', sum(o > 0.25 for o in over),
                max(over)])
    # sol 2: divide post views by R and re-estimate; the typical-video contrast that remains
    adj = channel_stats({c: (a, [v / R for v in b]) for c, (a, b) in g.items()})
    (rl, rh), (tl, th) = bootstrap(adj, reps=1000)
    chk.append(['post views divided by R: ratio of totals', estimate(adj)[0], ''])
    chk.append(['post views divided by R: typical video (95% low, high)', estimate(adj)[1], f'{tl:.4f} {th:.4f}'])
    # sol 3: how large a long-form-only change in underlying viewing would bring the rule effect down to 25%
    chk.append(['underlying change needed for rule effect = 25%, ratio of totals (R / 1.25)', R / 1.25, ''])
    chk.append(['underlying change needed for rule effect = 25%, typical video (T / 1.25)', T / 1.25, ''])
    for label, n, s, lift_ in res['transition_stock']:
        chk.append([f'published 2026-07-26..08-23, stored-total lift modeled from day-29 cohort ratios ({label}); videos / stored views',
                    lift_, f'{n} {int(s)}'])
    # All long-form, flat-rate scenario, with the transition cohort's paired videos swapped for the cohort-ratio model.
    low = {r_[0]: r_ for r_ in res['stock'] if r_[1] == 'flat_rate' and r_[2] == 'point'}
    s_all, add_all = low['all long-form'][5], low['all long-form'][8]
    s_a, add_a = low['published 2026-07-26..08-23'][5], low['published 2026-07-26..08-23'][8]
    _, _, s_m, lift_m = res['transition_stock'][0]
    added = add_all - add_a * s_m / s_a + s_m * lift_m / (1 + lift_m)
    chk.append(['all long-form stored-total lift, modeled: flat-rate scenario, transition cohort from cohort ratios',
                added / (s_all - added), ''])
    # Round 2, finding 2: the two accrual scenarios are not bounds. Count paired videos where flat_rate > even_spread.
    n_x = s_lo = s_hi = 0
    ex = None
    for r in rows:
        if r['is_yt_short'] != 0 or r['view_count'] is None or r['P'] >= CHANGE:
            continue
        T1, T2, v1 = r['T1'], r['T2'], r['prev_view_count']
        if T1 is None or v1 is None or T2 is None or T2 <= T1 or T1 < CHANGE:
            continue
        inc = max(0, r['view_count'] - v1)
        a_lo = inc + min(v1, inc / (T2 - T1) * (T1 - CHANGE))
        a_hi = inc + (v1 * (T1 - CHANGE) / (T1 - r['P']) if T1 > r['P'] else 0)
        if a_lo > a_hi:
            n_x += 1
            s_lo += a_lo
            s_hi += a_hi
            if ex is None or v1 > ex[1]:
                ex = (r['published_at'][:10], v1, iso(T1), r['view_count'], iso(T2), round(a_lo), round(a_hi))
    chk.append(['paired videos where flat-rate accrual exceeds even-spread accrual: videos / summed flat-rate, even-spread',
                n_x, f'{round(s_lo)} {round(s_hi)}'])
    chk.append(['  largest such video: published, V1, T1, V2, T2, flat-rate, even-spread', ex[1], ' '.join(map(str, ex))])
    ident = {(r_[1], r_[2]): r_ for r_ in res['stock'] if r_[0] == 'all long-form'}
    for b in ('identified_min', 'identified_max'):
        chk.append([f'all long-form, {b} post-switch accrual / stored-total lift at R', ident[(b, 'point')][6],
                    f"{ident[(b, 'point')][9]:.4f}"])
    dur = [[x['dur'] for x in lf_pick if x['channel'] in g and f(x) and x['dur']] for f in (pre_r, post_r)]
    chk.append(['median duration (s), headline sample, pre / post', st.median(dur[0]), st.median(dur[1])])
    write_csv('review_checks.csv', ['check', 'value', 'second_value'], chk)
    res['checks'] = chk
    return res
