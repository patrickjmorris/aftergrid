import os
import sqlite3, math, statistics as st
from collections import defaultdict
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe1.py')).read().split('def cohort')[0])
c=[r for r in reads if r[3]==0 and 28<=r[6]-r[5]<30]
base=defaultdict(list)
for r in c:
    if r[6]<CH: base[r[1]].append(math.log1p(r[7]))
base={k:st.mean(v) for k,v in base.items()}
for lo,hi,label in [(28,30,'age28-30'),(30,45,'age30-45'),(45,100,'age45-100'),(5,28,'age5-28')]:
    byd=defaultdict(list); rd=defaultdict(list)
    for r in reads:
        if r[3]==0 and r[1] in base and lo<=r[6]-r[5]<hi:
            d=math.floor(r[5]-CH); byd[d].append(math.log1p(r[7])-base[r[1]]); rd[d].append(r[6]-CH)
    print(label,' '.join(f'{d}:{len(byd[d])}:{math.exp(st.mean(byd[d])):.2f}@{st.median(rd[d]):.0f}' for d in range(-8,10) if len(byd[d])>=20))
