import os
import sqlite3, math, statistics as st
from collections import defaultdict
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe1.py')).read().split('def cohort')[0])
# channel baseline = mean log views at age 28-30 among pre-cohort videos
c=[r for r in reads if r[3]==0 and 28<=r[6]-r[5]<30]
base=defaultdict(list)
for r in c:
    if r[6]<CH: base[r[1]].append(math.log1p(r[7]))
base={k:st.mean(v) for k,v in base.items()}
byd=defaultdict(list); kind=defaultdict(list)
for r in c:
    if r[1] in base:
        d=math.floor(r[5]-CH)
        byd[d//7].append(math.log1p(r[7])-base[r[1]])
        if r[5]>=CH+1: kind[r[8]].append(math.log1p(r[7])-base[r[1]])
print('publish week rel to 8/24: n, mean resid vs channel pre baseline, exp')
for w in sorted(byd):
    if len(byd[w])>50: print(w, len(byd[w]), round(st.mean(byd[w]),3), round(math.exp(st.mean(byd[w])),3))
print('post cohort by reading kind', {k:(len(v), round(math.exp(st.mean(v)),3)) for k,v in kind.items()})
# coverage: share of LF videos per publish week with a reading at 28-30
allv=defaultdict(set); cov=defaultdict(set)
for vk,ck,sp,f,d,p,t1,v1,t2,v2 in rows:
    if f==0: allv[math.floor(ts(p)-CH)//7].add(vk)
for r in c: cov[math.floor(r[5]-CH)//7].add(r[0])
print('coverage share by publish week'); print([(w,len(allv[w]),round(len(cov[w])/len(allv[w]),2)) for w in range(-15,6)])
