import sqlite3, math, statistics as st
from collections import defaultdict
from datetime import datetime, timezone
import os; DB = os.path.join(os.environ.get('SPOTSPORTS_EXTRACT_DIR', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'data')), 'videos.sqlite')
con=sqlite3.connect(DB)
def ts(s):
    if s is None: return None
    s=s.replace('+00','')
    return datetime.fromisoformat(s[:26]).replace(tzinfo=timezone.utc).timestamp()/86400
CH=ts('2026-08-24 00:00:00')
rows=con.execute("select video_key,channel_key,sport,is_yt_short,duration_seconds,published_at,prev_view_count_at,prev_view_count,last_stats_check,view_count from videos").fetchall()
reads=[]
for vk,ck,sp,f,d,p,t1,v1,t2,v2 in rows:
    if f is None: continue
    P=ts(p)
    if t1 and v1 is not None: reads.append((vk,ck,sp,f,d,P,ts(t1),v1,'prev'))
    if t2 and v2 is not None: reads.append((vk,ck,sp,f,d,P,ts(t2),v2,'last'))
def cohort(f,lo,hi):
    out=[]
    for r in reads:
        if r[3]!=f: continue
        age=r[6]-r[5]
        if lo<=age<hi: out.append(r)
    return out
for f,lo,hi in [(0,28,30),(1,12,14)]:
    c=cohort(f,lo,hi)
    pre=defaultdict(list); post=defaultdict(list)
    for r in c:
        if r[6]<CH: pre[r[1]].append(math.log1p(r[7]))
        elif r[5]>=CH+1: post[r[1]].append(math.log1p(r[7]))
    both=[k for k in pre if k in post]
    diffs=[st.mean(post[k])-st.mean(pre[k]) for k in both]
    w=[min(len(pre[k]),len(post[k])) for k in both]
    print('fmt',f,'age',lo,hi,'pre ch',len(pre),'post ch',len(post),'both',len(both),'npre',sum(len(pre[k]) for k in both),'npost',sum(len(post[k]) for k in both))
    print('  mean within-ch diff', round(st.mean(diffs),3),'median',round(st.median(diffs),3),'exp',round(math.exp(st.mean(diffs)),3), 'wtd', round(math.exp(sum(a*b for a,b in zip(diffs,w))/sum(w)),3))
