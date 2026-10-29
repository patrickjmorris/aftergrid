"""Review probe 1: re-check reviewer findings against the data. Stdout only."""
import os, sys, math, statistics as st
from collections import defaultdict
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from common import load_rows, readings, CHANGE, day, iso, channel_sport
from metric import pick_reading, groups, channel_stats, estimate, LF_AGE, SH_AGE, POST_START

rows = load_rows()
rd = readings(rows)
lf = pick_reading(rd, 0, *LF_AGE)
sh = pick_reading(rd, 1, *SH_AGE)
pre = lambda x: x['T'] < CHANGE
post = lambda x: x['P'] >= POST_START
g, _, _ = groups(lf, pre, post)
cs = channel_stats(g)

def est_w(cs, chans=None, wfun=None):
    chans = chans if chans is not None else list(cs)
    num = den = wl = w = 0.0
    for c in chans:
        n, mpre, mpost, lpre, lpost, m = cs[c]
        ww = wfun(n, m)
        num += ww * mpost; den += ww * mpre; wl += ww * (lpost - lpre); w += ww
    return num / den, math.exp(wl / w)
npre_w = lambda n, m: n
prec_w = lambda n, m: n * m / (n + m)
print('G2 v1 npre weights', est_w(cs, wfun=npre_w))
print('G2 precision weights', est_w(cs, wfun=prec_w))
# The two channels with the most pre videos per post video, which the review named.
for i, k in enumerate(sorted(cs, key=lambda k: cs[k][0] / max(cs[k][5], 1))[-2:], 1):
    if True:
        n, mpre, mpost, lpre, lpost, m = cs[k]
        print('channel', i, 'npre', n, 'npost', m, 'mpre', round(mpre), 'mpost', round(mpost))
        rest = [x for x in cs if x != k]
        print('  without it: npre', est_w(cs, rest, npre_w), 'prec', est_w(cs, rest, prec_w))
# mix term contributions
common = list(cs)
NPRE = sum(cs[c][0] for c in common); NPOST = sum(cs[c][5] for c in common)
mixc = {c: (cs[c][5] / NPOST - cs[c][0] / NPRE) * cs[c][2] for c in common}
tot = sum(mixc.values())
top = sorted(mixc, key=lambda c: mixc[c])[:3]
print('mix term', tot, 'top contributors', [round(mixc[c]) for c in top])

# S2: divide post by R, recompute geometric
R1 = est_w(cs, wfun=npre_w)[0]
R2 = est_w(cs, wfun=prec_w)[0]
for R, lab in ((R1, 'v1'), (R2, 'v2')):
    adj = {c: (a, [v / R for v in b]) for c, (a, b) in g.items()}
    acs = channel_stats(adj)
    print('S2 after /R', lab, 'npre', est_w(acs, wfun=npre_w), 'prec', est_w(acs, wfun=prec_w))

# O1: quantile ratios, post reweighted to pre channel mix
pre_v = sorted(v for c in g for v in g[c][0])
postw = []
for c, (a, b) in g.items():
    for v in b:
        postw.append((v, len(a) / len(b)))
postw.sort()
W = sum(w for _, w in postw)
def wq(p):
    acc = 0
    for v, w in postw:
        acc += w
        if acc >= p * W:
            return v
def q(xs, p):
    return xs[int(p * (len(xs) - 1))]
print('O1 quantile ratios:', [(p, round(wq(p) / q(pre_v, p), 2)) for p in (0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999)])

# O3: ranking pool publish dates
pool = [x for x in lf if x['channel'] in g and (pre(x) or post(x))]
for lab, f in (('pre', pre), ('post', post)):
    ps = [x['P'] for x in pool if f(x)]
    print('O3 pool', lab, iso(min(ps)), iso(max(ps)), len(ps))

# S4: 2025 placebo ages
CH25 = day('2025-08-24 00:00:00')
june = [x for x in rd if x['kind'] == 'last' and x['T'] < CHANGE and x['P'] < day('2026-01-01 00:00:00') and x['fmt'] == 0]
gp, _, _ = groups(june, lambda x: x['P'] < CH25 - 30, lambda x: CH25 + 7 <= x['P'] < CH25 + 37)
ages = defaultdict(list)
for x in june:
    if x['channel'] in gp:
        if x['P'] < CH25 - 30: ages['pre'].append(x['age'])
        elif CH25 + 7 <= x['P'] < CH25 + 37: ages['post'].append(x['age'])
for k, v in ages.items():
    print('S4 placebo ages', k, len(v), round(min(v), 1), round(st.mean(v), 1), round(max(v), 1))
print('S4 readings dates', iso(min(x['T'] for x in june)), iso(max(x['T'] for x in june)))

# O4/S5: segment table
import csv
for r in csv.DictReader(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'results', 'lift_by_segment.csv'))):
    lo = float(r['rt_lo']) if r['rt_lo'] else None
    if r['segment_type'] in ('sport', 'duration') or 'independent' in r['segment_type']:
        flag = []
        if lo is not None and lo < 1: flag.append('CI<1')
        if lo is not None and float(r['rt_hi']) < 1.7711: flag.append('CI excludes 1.77')
        if lo is not None and lo < 1.25: flag.append('lo<1.25')
        print('seg', r['segment_type'][:20], r['label'], r['ratio_of_totals'], r['rt_lo'], r['rt_hi'], r['channels'], flag)

# G5: inventory distinct videos
vids = defaultdict(set); nread = defaultdict(int)
for x in readings(rows, include_ingest_only=True):
    lo_, hi_ = (28, 30) if x['fmt'] == 0 else (12, 14)
    if lo_ <= x['age'] < hi_:
        side = 'before' if x['T'] < CHANGE else ('after' if x['P'] >= CHANGE else 'straddle')
        vids[(x['fmt'], side)].add(x['video']); nread[(x['fmt'], side)] += 1
for k in sorted(vids, key=str):
    print('G5 inventory', k, 'readings', nread[k], 'videos', len(vids[k]))
# G5: 20-28 ages
p2 = pick_reading(rd, 0, 20, 28)
g2, _, _ = groups(p2, pre, post)
for lab, f in (('pre', pre), ('post', post)):
    a = [x['age'] for x in p2 if x['channel'] in g2 and f(x)]
    print('G5 20-28 ages', lab, len(a), round(st.median(a), 2), round(st.mean(a), 2))
