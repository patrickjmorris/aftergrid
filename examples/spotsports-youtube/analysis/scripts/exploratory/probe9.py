import os
import sqlite3, math, statistics as st
from collections import defaultdict, Counter
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'probe1.py')).read().split('def cohort')[0])
CHS=Counter(); 
for vk,ck,sp,f,d,p,t1,v1,t2,v2 in rows:
    if sp!='Unassigned': CHS[(ck,sp)]+=1
chsport={}
for (ck,sp),n in CHS.items():
    if ck not in chsport or n>CHS[(ck,chsport[ck])]: chsport[ck]=sp
POST0=CH+7
def lift(sel, key):
    pre=defaultdict(list); post=defaultdict(list)
    for r in sel:
        if r[6]<CH: pre[(key(r),r[1])].append(math.log1p(r[7]))
        elif r[5]>=POST0: post[(key(r),r[1])].append(math.log1p(r[7]))
    out=defaultdict(list)
    for k in pre:
        if k in post: out[k[0]].append(st.mean(post[k])-st.mean(pre[k]))
    return out
lf=[r for r in reads if r[3]==0 and 28<=r[6]-r[5]<30]
sh=[r for r in reads if r[3]==1 and 12<=r[6]-r[5]<14]
for name,sel in [('LF age28-30',lf),('SH age12-14',sh)]:
    o=lift(sel, lambda r: chsport.get(r[1],'?'))
    print(name,'by channel sport: channels, geo ratio of within-channel means')
    print('  '+'; '.join(f'{k}:{len(v)}:{math.exp(st.mean(v)):.2f}' for k,v in sorted(o.items(), key=lambda kv:-len(kv[1])) if len(v)>=5))
def dband(r):
    d=r[4] or 0
    return '<=60' if d<=60 else '61-180' if d<=180 else '3-10m' if d<=600 else '10-20m' if d<=1200 else '20-60m' if d<=3600 else '>60m'
o=lift(lf, dband)
print('LF by duration band (within channel x band):', '; '.join(f'{k}:{len(v)}:{math.exp(st.mean(v)):.2f}' for k,v in o.items()))
# duration mix within channel pre vs post
pre=[r[4] for r in lf if r[6]<CH and r[4]]; post=[r[4] for r in lf if r[5]>=POST0 and r[4]]
print('LF median duration pre',st.median(pre),'post',st.median(post))
