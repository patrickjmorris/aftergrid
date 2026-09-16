-- 7-day retention by signup week and arm. Row key: week_arm = <monday>_<arm>.
-- Parameters: $tz, $exp_start, $exp_end. Tables: users, events. Definition: retained_7d v2.
with cohort as (
  select user_id, onboarding_variant as arm,
         cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day
  from users
  where onboarding_variant in ('checklist', 'control')
),
cohort_in_window as (
  select *, date_trunc('week', signup_day)::date as signup_week
  from cohort where signup_day between $exp_start::date and $exp_end::date
),
opens as (
  select user_id, cast(timezone($tz, "timestamp"::timestamptz) as date) as open_day
  from events where event = 'app_open'
),
flags as (
  select c.arm, c.signup_week, c.user_id,
         exists (select 1 from opens o where o.user_id = c.user_id
                 and o.open_day between c.signup_day + 1 and c.signup_day + 7) as retained_7d
  from cohort_in_window c
)
select strftime(signup_week, '%Y-%m-%d') || '_' || arm as week_arm,
       signup_week, arm,
       count(*)                                   as signups,
       count(*) filter (where retained_7d)        as retained,
       (count(*) filter (where retained_7d))::decimal(12,6) / count(*) as retained_7d_rate
from flags
group by signup_week, arm
order by signup_week, arm
