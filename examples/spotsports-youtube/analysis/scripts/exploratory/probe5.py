import os
import sqlite3, math, statistics as st
from collections import defaultdict
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe1.py')).read().split('def cohort')[0])
CH25=ts('2025-08-24 00:00:00')
for f in (0,1):
    last=[r for r in reads if r[3]==f and r[8]=='last' and r[6]-r[5]>=90]
    base=defaultdict(list)
    for r in last:
        w=math.floor(r[5]-CH25)//7
        if -7<=w<=-1: base[r[1]].append(math.log1p(r[7]))
    base={k:st.mean(v) for k,v in base.items()}
    byw=defaultdict(list); rt=defaultdict(list)
    for r in last:
        if r[1] in base:
            w=math.floor(r[5]-CH25)//7; byw[w].append(math.log1p(r[7])-base[r[1]]); rt[w].append(r[6])
    print(f'fmt {f}: 2025 placebo, lifetime count (last reading, age>=90d), baseline publish weeks -7..-1 rel 2025-08-24, channels {len(base)}')
    print('  '+' '.join(f'{w}:{len(byw[w])}:{math.exp(st.mean(byw[w])):.2f}' for w in range(-8,12) if len(byw[w])>=30))
    print('  reading dates (median rel 2026-08-24):', ' '.join(f'{w}:{st.median(rt[w])-CH:.0f}' for w in range(-8,12) if len(rt[w])>=30))
