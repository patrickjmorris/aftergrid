"""External-comparison probe: external.cohort_percentiles reproduces review.py's success check (stdout only).
Recomputes the sport-level spread across the switch and compares it with results/trial_rank_check.csv."""
import csv
import os
import statistics as st
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import CHANGE, channel_sport, load_rows, readings  # noqa: E402
from diagnose import pre_r  # noqa: E402
from external import cohort_percentiles  # noqa: E402
from metric import LF_AGE, pick_reading, weight  # noqa: E402

rows = load_rows()
rd = readings(rows)
pick = pick_reading(rd, 0, *LF_AGE)
pct = cohort_percentiles(pick)
csport = channel_sport(rows)
gg = defaultdict(lambda: ([], []))
for x in pick:
    if x['video'] in pct:
        if pre_r(x):
            gg[x['channel']][0].append(pct[x['video']])
        elif x['P'] >= CHANGE + 3:
            gg[x['channel']][1].append(pct[x['video']])
by = defaultdict(list)
for c, (u, v) in gg.items():
    if u and v:
        by[csport.get(c)].append((st.mean(v) - st.mean(u), weight(len(u), len(v), 'balanced')))
sp = {s: sum(d * w for d, w in v) / sum(w for _, w in v) for s, v in by.items() if len(v) >= 10}
here = round(st.stdev(sp.values()), 4)
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'results', 'trial_rank_check.csv')
stored = float(next(csv.DictReader(open(path)))['sd_sport_shift_pct_points'])
print('sport spread across the switch: here', here, 'stored', stored, 'match', here == stored)
