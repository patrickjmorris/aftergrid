"""Round-2 probe: what drives the 2026-06-22 week's early/late typical contrast (stdout only)."""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import CHANGE, iso, load_rows, readings  # noqa: E402
from metric import LF_AGE, lift, pick_reading  # noqa: E402

rows = load_rows()
rd = readings(rows)
pick = pick_reading(rd, 0, *LF_AGE)
s = CHANGE - 63
wk = [x for x in pick if s <= x['P'] < s + 7]
z = defaultdict(lambda: [0, 0, 0, 0])
for x in wk:
    late = x['P'] >= s + 3
    z[x['channel']][late] += 1
    z[x['channel']][2 + late] += x['views'] == 0
top = sorted(z.items(), key=lambda kv: -(kv[1][2] + kv[1][3]))[:3]
for c, v in top:
    print(c[:10], 'early n, late n, early zeros, late zeros', v)
drop = {c for c, v in z.items() if v[2] >= 10}
r = lift(rd, 0, LF_AGE, picked=[x for x in pick if x['channel'] not in drop],
         pre_rule=lambda x: s <= x['P'] < s + 3, post_rule=lambda x: s + 3 <= x['P'] < s + 7, reps=500)
print('06-22 week without channels with 10+ early zero-view videos', round(r['ratio_of_totals'], 3), round(r['typical_video'], 3),
      round(r['tv_lo'], 3), round(r['tv_hi'], 3), r['channels'])
