"""Round-2 review re-check, finding 1: contrast inside the 2026-08-24 publish week, and the same early/late split
in every publish week (stdout only)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import CHANGE, iso, load_rows, readings  # noqa: E402
from metric import LF_AGE, lift, pick_reading  # noqa: E402

rows = load_rows()
rd = readings(rows)
pick = pick_reading(rd, 0, *LF_AGE)
# reviewer's direct comparison: 08-27..08-30 (post) vs 08-24..08-26 (pre), same channels, balanced weights
r = lift(rd, 0, LF_AGE, picked=pick, pre_rule=lambda x: CHANGE <= x['P'] < CHANGE + 3,
         post_rule=lambda x: CHANGE + 3 <= x['P'] < CHANGE + 7, reps=1000)
print('08-27..30 vs 08-24..26', round(r['ratio_of_totals'], 4), round(r['rt_lo'], 3), round(r['rt_hi'], 3),
      round(r['typical_video'], 4), round(r['tv_lo'], 3), round(r['tv_hi'], 3), r['channels'], r['pre_videos'], r['post_videos'])
# every Monday-start week: Thu-Sun vs Mon-Wed
for k in range(-16, 6):
    s = CHANGE + 7 * k
    r = lift(rd, 0, LF_AGE, picked=pick, pre_rule=lambda x, s=s: s <= x['P'] < s + 3,
             post_rule=lambda x, s=s: s + 3 <= x['P'] < s + 7, reps=500)
    if r is None or r['channels'] < 30:
        print(iso(s), 'too few', r and r['channels'])
        continue
    print(iso(s), round(r['ratio_of_totals'], 3), round(r['rt_lo'], 3), round(r['rt_hi'], 3),
          round(r['typical_video'], 3), round(r['tv_lo'], 3), round(r['tv_hi'], 3), r['channels'], r['pre_videos'], r['post_videos'])
