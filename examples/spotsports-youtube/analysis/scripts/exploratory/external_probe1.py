"""External-comparison probe: which pre-switch readings can define Agentio-style size tiers (stdout only)."""
import os
import statistics as st
import sys
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import CHANGE, day, load_rows, readings  # noqa: E402
from metric import LF_AGE, lift, pick_reading  # noqa: E402

rows = load_rows()
rd = readings(rows)
pick = pick_reading(rd, 0, *LF_AGE)
lf = lift(rd, 0, LF_AGE, picked=pick, reps=0)
cs = lf['cs']
used = {x['video'] for x in pick if x['channel'] in cs and (x['T'] < CHANGE or x['P'] >= CHANGE + 7)}

# old-rule readings (taken before the switch) of long-form videos outside the estimate
old = [x for x in rd if x['fmt'] == 0 and x['T'] < CHANGE and x['video'] not in used and x['channel'] in cs]
print('old-rule readings outside the estimate, matched channels:', len(old), 'videos', len({x['video'] for x in old}),
      'channels', len({x['channel'] for x in old}))
ages = sorted(x['age'] for x in old)
print('age quantiles', [round(ages[int(p * (len(ages) - 1))], 1) for p in (0.1, 0.25, 0.5, 0.75, 0.9)])
pub = sorted(x['P'] for x in old)
from common import iso  # noqa: E402
print('publish quantiles', [iso(pub[int(p * (len(pub) - 1))]) for p in (0.1, 0.25, 0.5, 0.75, 0.9)])

# latest old-rule reading per video, then channel mean
best = {}
for x in old:
    if x['video'] not in best or x['T'] > best[x['video']]['T']:
        best[x['video']] = x
ch = defaultdict(list)
for x in best.values():
    ch[x['channel']].append(x['views'])
for lab, f in (('all ages', lambda a: True), ('age 7-120 days', lambda a: 7 <= a < 120)):
    ch2 = defaultdict(list)
    for x in best.values():
        if f(x['age']):
            ch2[x['channel']].append(x['views'])
    m = {c: st.mean(v) for c, v in ch2.items() if len(v) >= 3}
    tiers = defaultdict(list)
    for c, v in m.items():
        tiers['<50k' if v < 5e4 else '50k-300k' if v < 3e5 else '300k+'].append(c)
    print(lab, 'channels with 3+ videos', len(m), {k: len(v) for k, v in tiers.items()})

# alternative: pre group's own day-29 mean (regression to the mean)
m = {c: v[1] for c, v in cs.items()}
tiers = defaultdict(list)
for c, v in m.items():
    tiers['<50k' if v < 5e4 else '50k-300k' if v < 3e5 else '300k+'].append(c)
print('pre-group day-29 mean', {k: len(v) for k, v in tiers.items()})

# Jan-Apr 2026 long-form, current lifetime counts (the earlier tercile measure), as a mean
ind = defaultdict(list)
for r in rows:
    if r['is_yt_short'] == 0 and r['view_count'] is not None and day('2026-01-01 00:00:00') <= r['P'] < day('2026-05-01 00:00:00'):
        ind[r['channel_key']].append(r['view_count'])
m = {c: st.mean(ind[c]) for c in cs if c in ind}
tiers = defaultdict(list)
for c, v in m.items():
    tiers['<50k' if v < 5e4 else '50k-300k' if v < 3e5 else '300k+'].append(c)
print('Jan-Apr lifetime mean', len(m), {k: len(v) for k, v in tiers.items()})
