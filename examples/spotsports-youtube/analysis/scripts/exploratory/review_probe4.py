"""Review probe 4: O2 transition days, G3 Shorts outlier channel, G4 straddler growth windows. Stdout only."""
import os, sys, math, statistics as st, csv
from collections import defaultdict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import load_rows, readings, CHANGE, day, iso
from metric import pick_reading, groups, channel_stats, LF_AGE, SH_AGE, POST_START

for r in csv.DictReader(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'results', 'event_study.csv'))):
    if r['series'].startswith('long') and r['unit'] == 'day' and -6 <= int(r['publish_offset']) <= 5:
        print('O2 day', r['publish_start'], r['videos'], r['ratio_to_channel_pre_baseline'])
rows = load_rows()
rd = readings(rows)
lf = pick_reading(rd, 0, *LF_AGE)
sh = pick_reading(rd, 1, *SH_AGE)
# O2: within channel Aug 27-29 vs Aug 24-26
a = defaultdict(list); b = defaultdict(list)
for x in lf:
    if CHANGE <= x['P'] < CHANGE + 3: a[x['channel']].append(x['views'])
    elif CHANGE + 3 <= x['P'] < CHANGE + 6: b[x['channel']].append(x['views'])
cc = set(a) & set(b)
w = {c: len(a[c]) * len(b[c]) / (len(a[c]) + len(b[c])) for c in cc}
print('O2 27-29 vs 24-26: channels', len(cc), 'npre-weighted', sum(len(a[c]) * st.mean(b[c]) for c in cc) / sum(len(a[c]) * st.mean(a[c]) for c in cc),
      'precision', sum(w[c] * st.mean(b[c]) for c in cc) / sum(w[c] * st.mean(a[c]) for c in cc))
# G3: Shorts outlier channel
g, _, _ = groups(sh, lambda x: x['T'] < CHANGE, lambda x: x['P'] >= POST_START)
tot_pre = sum(sum(v[0]) for v in g.values())
big = sorted(g, key=lambda c: -sum(g[c][0]))[:3]
for c in big:
    print('G3', c[:12], 'npre', len(g[c][0]), 'npost', len(g[c][1]), 'pre share', round(sum(g[c][0]) / tot_pre, 4),
          'mpre', round(st.mean(g[c][0])), 'mpost', round(st.mean(g[c][1])))
cs = channel_stats(g)
def R(cs, wf):
    num = den = 0
    for c, (n, mp, mq, _, _, m) in cs.items():
        ww = wf(n, m); num += ww * mq; den += ww * mp
    return num / den
for lab, wf in (('npre', lambda n, m: n), ('prec', lambda n, m: n * m / (n + m))):
    print('G3 shorts', lab, R(cs, wf), 'without top', R({c: v for c, v in cs.items() if c != big[0]}, wf))
# G4: straddler growth elapsed windows
for r in csv.DictReader(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'results', 'straddler_growth.csv'))):
    print('G4', r['group'][:40], r['videos'], r['channels'], r['median_age_1'], r['median_age_2'], r['aggregate_growth'], r['geomean_growth'])
