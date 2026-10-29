"""Round-2 probe: trial ranking check at day 29. Percentile within cohort, then per-sport mean shift
across the switch vs across two null cutovers (stdout only)."""
import math
import os
import statistics as st
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import CHANGE, channel_sport, load_rows, readings  # noqa: E402
from metric import LF_AGE, POST_START, pick_reading, weight  # noqa: E402

rows = load_rows()
rd = readings(rows)
pick = pick_reading(rd, 0, *LF_AGE)
csport = channel_sport(rows)
BAND = (CHANGE - 28, CHANGE + 3)  # 07-27 .. 08-26


def cohort(x):
    if BAND[0] <= x['P'] < BAND[1]:
        return None
    if CHANGE + 3 <= x['P'] < CHANGE + 7:
        return 'w+0b'
    return math.floor((x['P'] - CHANGE) / 7)


coh = defaultdict(list)
for x in pick:
    k = cohort(x)
    if k is not None:
        coh[k].append(x)
pct = {}
for k, xs in coh.items():
    xs.sort(key=lambda x: x['views'])
    n = len(xs)
    i = 0
    while i < n:
        j = i
        while j + 1 < n and xs[j + 1]['views'] == xs[i]['views']:
            j += 1
        for t in range(i, j + 1):
            pct[xs[t]['video']] = 100 * ((i + j) / 2 + 0.5) / n
        i = j + 1
JUL1 = CHANGE - 54
SEP14 = CHANGE + 21
pre_r = lambda x: x['T'] < CHANGE  # noqa: E731
cuts = (('switch', pre_r, lambda x: x['P'] >= CHANGE + 3),
        ('null before/after 07-01', lambda x: pre_r(x) and x['P'] < JUL1, lambda x: pre_r(x) and x['P'] >= JUL1),
        ('null 08-31..09-13 vs 09-14 on', lambda x: POST_START <= x['P'] < SEP14, lambda x: x['P'] >= SEP14))
for lab, a, b in cuts:
    g = defaultdict(lambda: ([], []))
    for x in pick:
        if x['video'] not in pct:
            continue
        if a(x):
            g[x['channel']][0].append(pct[x['video']])
        elif b(x):
            g[x['channel']][1].append(pct[x['video']])
    g = {c: v for c, v in g.items() if v[0] and v[1]}
    sh = {c: (st.mean(v[1]) - st.mean(v[0]), weight(len(v[0]), len(v[1]), 'balanced')) for c, v in g.items()}
    bysport = defaultdict(list)
    for c, (d, w) in sh.items():
        bysport[csport.get(c)].append((d, w))
    sp = {s: sum(d * w for d, w in v) / sum(w for _, w in v) for s, v in bysport.items() if len(v) >= 10}
    wall = sum(w for _, w in sh.values())
    mean_all = sum(d * w for d, w in sh.values()) / wall
    sd_ch = math.sqrt(sum(w * (d - mean_all) ** 2 for d, w in sh.values()) / wall)
    print(lab, 'channels', len(sh), 'sports', len(sp), 'mean shift', round(mean_all, 2), 'channel sd', round(sd_ch, 2),
          'sport sd', round(st.stdev(sp.values()), 2), 'range', round(min(sp.values()), 1), round(max(sp.values()), 1))
    print('   ', ' '.join(f'{s}:{v:+.1f}' for s, v in sorted(sp.items(), key=lambda kv: kv[1])))
