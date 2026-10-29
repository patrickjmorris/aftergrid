"""Review probe 5: straddler growth group sizes under a matched elapsed window, and 20-28 vs 26-28 day ages. Stdout only."""
import os, sys, math, statistics as st
from collections import defaultdict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import load_rows, readings, CHANGE
from metric import lift

rows = load_rows()
grp = defaultdict(list)
for r in rows:
    if r['is_yt_short'] != 0 or None in (r['T1'], r['T2'], r['prev_view_count'], r['view_count']) or r['prev_view_count'] <= 0:
        continue
    a1, a2 = r['T1'] - r['P'], r['T2'] - r['P']
    if not (27 <= a1 < 31):
        continue
    el = a2 - a1
    if r['T1'] < CHANGE and r['T2'] >= CHANGE + 1:
        k = 'g1'
    elif r['T1'] >= CHANGE and CHANGE - 29 <= r['P'] < CHANGE - 15:
        k = 'g2'
    elif r['P'] >= CHANGE:
        k = 'g3'
    else:
        continue
    grp[k].append((el, r))
for k in sorted(grp):
    els = [e for e, _ in grp[k]]
    print(k, len(els), 'elapsed quartiles', [round(st.quantiles(els, n=4)[i], 1) for i in range(3)])
    for lo, hi in ((26, 34), (29, 33), (30, 32)):
        sel = [r for e, r in grp[k] if lo <= e < hi]
        if sel:
            agg = sum(r['view_count'] for r in sel) / sum(r['prev_view_count'] for r in sel)
            print('  elapsed', lo, hi, len(sel), 'agg', round(agg, 4))
rd = readings(rows)
for age in ((20, 28), (24, 28), (26, 28), (26.5, 28)):
    r = lift(rd, 0, age, reps=0)
    print('age', age, round(r['ratio_of_totals'], 3), round(r['typical_video'], 3), round(r['pre_age_mean'], 2), round(r['post_age_mean'], 2), r['channels'], r['pre_videos'], r['post_videos'])
