"""Review probe 2: accrual curve from videos with a young first reading and a day-29 last reading. Stdout only."""
import os, sys, math, statistics as st
from collections import defaultdict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import load_rows, CHANGE, iso

rows = load_rows()
cell = defaultdict(lambda: [0, 0, 0, set(), [], 0])
for r in rows:
    if r['is_yt_short'] != 0 or r['T1'] is None or r['T2'] is None or r['prev_view_count'] is None or r['view_count'] is None:
        continue
    a1, a2 = r['T1'] - r['P'], r['T2'] - r['P']
    if 0 <= a1 < 28 and 28 <= a2 < 30.5 and r['view_count'] > 0:
        k = int(a1)
        c = cell[k]
        c[0] += r['prev_view_count']; c[1] += r['view_count']; c[2] += 1; c[3].add(iso(r['P'])[:7])
        c[4].append(abs(r['T1'] - r['I']) < 0.01)
        c[5] += r['P'] < CHANGE
for k in sorted(cell):
    c = cell[k]
    print(k, 'videos', c[2], 'V1/V2', round(c[0] / c[1], 3), 'months', sorted(c[3]), 'T1==ingest share', round(sum(c[4]) / len(c[4]), 2), 'pre-switch publishes', c[5])
