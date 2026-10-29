-- Independent SQL check of the long-form estimate (ratio of totals, within channel).
-- Same rules as scripts/metric.py: age 28-30 days, one reading per video closest to 29 days,
-- pre = read before 2026-08-24 UTC, post = published on or after 2026-08-31 UTC, channels in both groups.
-- ratio_balanced is the version-2 primary (channel weight npre*npost/(npre+npost)); ratio_pre_weights is version 1.
-- julianday() here drops fractional seconds, so a few boundary readings can differ from Python.
with r as (
  select video_key, channel_key, is_yt_short f, published_at p, prev_view_count_at t, prev_view_count v
  from videos where prev_view_count_at is not null and prev_view_count is not null
  union all
  select video_key, channel_key, is_yt_short, published_at, last_stats_check, view_count
  from videos where last_stats_check is not null and view_count is not null),
a as (select *, julianday(substr(t,1,19)) - julianday(substr(p,1,19)) age from r where f = :fmt),
w as (select *, row_number() over (partition by video_key order by abs(age - (:lo + :hi) / 2.0)) rn
      from a where age >= :lo and age < :hi),
g as (select channel_key,
             case when t < '2026-08-24' then 'pre' when p >= '2026-08-31' then 'post' end grp, v
      from w where rn = 1),
c as (select channel_key, sum(grp = 'pre') npre, sum(grp = 'post') npost,
             avg(case when grp = 'pre' then v end) mpre, avg(case when grp = 'post' then v end) mpost
      from g where grp is not null group by 1 having npre > 0 and npost > 0)
select count(*) channels, sum(npre) pre_videos, sum(npost) post_videos,
       sum(1.0 * npre * npost / (npre + npost) * mpost) / sum(1.0 * npre * npost / (npre + npost) * mpre) ratio_balanced,
       sum(npre * mpost) / sum(npre * mpre) ratio_pre_weights
from c;
