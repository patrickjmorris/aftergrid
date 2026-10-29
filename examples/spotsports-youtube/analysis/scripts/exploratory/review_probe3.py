"""Review probe 3: where young first readings sit, and the views ratio between paired readings by age. Stdout only."""
import os, sys
from collections import defaultdict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import load_rows, CHANGE, iso

rows = load_rows()
pairs = defaultdict(lambda: [0, 0, 0])
for r in rows:
    if r['is_yt_short'] != 0 or r['T1'] is None or r['T2'] is None or r['prev_view_count'] is None or r['view_count'] is None:
        continue
    a1, a2 = r['T1'] - r['P'], r['T2'] - r['P']
    if 0 <= a1 < 23 and a2 > a1:
        k = (int(a1), int(a2))
        p = pairs[k]; p[0] += r['prev_view_count']; p[1] += r['view_count']; p[2] += 1
top = sorted(pairs.items(), key=lambda kv: -kv[1][2])[:40]
for (a1, a2), (v1, v2, n) in sorted(top):
    print(a1, a2, n, round(v1 / v2, 3) if v2 else None)
