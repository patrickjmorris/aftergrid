-- Falsifier for the Question: the Answer is wrong if the checklist arm's 7-day retention is not at least
-- 3 percentage points above control, or if either arm has fewer than 500 signups (then pass is NULL: not evaluable).
-- Expected outcome: pass.
with cohort as (
  select user_id, onboarding_variant as arm, cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day
  from users where onboarding_variant in ('checklist', 'control')
),
w as (select * from cohort where signup_day between $exp_start::date and $exp_end::date),
opens as (
  select user_id, cast(timezone($tz, "timestamp"::timestamptz) as date) as open_day
  from events where event = 'app_open'
),
flags as (
  select c.arm, exists (select 1 from opens o where o.user_id = c.user_id
                        and o.open_day between c.signup_day + 1 and c.signup_day + 7) as retained_7d
  from w c
),
rates as (
  select arm, count(*) as signups,
         (count(*) filter (where retained_7d))::decimal(12,6) / count(*) as rate
  from flags group by arm
),
x as (
  select max(case when arm = 'checklist' then rate end) as checklist_rate,
         max(case when arm = 'control' then rate end) as control_rate,
         min(signups) as min_signups
  from rates
)
select case when min_signups < 500 then null else checklist_rate - control_rate >= 0.03 end as pass,
       'checklist ' || checklist_rate::varchar || ' control ' || control_rate::varchar || ' min signups ' || min_signups::varchar as detail
from x
