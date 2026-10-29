import os
import sqlite3, math, statistics as st
from collections import defaultdict
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe1.py')).read().split('def cohort')[0])
c=[r for r in reads if r[3]==0 and 28<=r[6]-r[5]<30]
base=defaultdict(list)
for r in c:
    if r[6]<CH: base[r[1]].append(math.log1p(r[7]))
base={k:st.mean(v) for k,v in base.items()}
# post-cohort channel level at 29d
post29=defaultdict(list)
for r in c:
    if r[5]>=CH+1: post29[r[1]].append(math.log1p(r[7]))
post29={k:st.mean(v) for k,v in post29.items()}
# age curve within channel for post publishers: log V(age) - channel post29 level
ac=defaultdict(list)
for r in reads:
    if r[3]==0 and r[5]>=CH+1 and r[1] in post29:
        a=r[6]-r[5]
        if 0<=a<30: ac[int(a*4)/4 if a<2 else int(a)].append(math.log1p(r[7])-post29[r[1]])
print('LF post-change age curve, share of 29d views (geo):', ' '.join(f'{a}:{len(ac[a])}:{math.exp(st.mean(ac[a])):.2f}' for a in sorted(ac) if len(ac[a])>=30))
byd=defaultdict(list)
for r in c:
    if r[1] in base:
        byd[math.floor(r[5]-CH)].append(math.log1p(r[7])-base[r[1]])
print('daily event study (publish day rel 8/24: n: ratio to channel pre baseline):')
print(' '.join(f'{d}:{len(byd[d])}:{math.exp(st.mean(byd[d])):.2f}' for d in range(-35,15) if len(byd[d])>=20))
