-- Invariant: random assignment produced arms of roughly equal size (checklist share within 45%..55%).
-- Returns one row: pass boolean, detail text.
with cohort as (
  select onboarding_variant as arm, cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day
  from users where onboarding_variant in ('checklist', 'control')
),
w as (select * from cohort where signup_day between $exp_start::date and $exp_end::date),
share as (select (count(*) filter (where arm = 'checklist'))::decimal(12,6) / count(*) as checklist_share from w)
select checklist_share between 0.45 and 0.55 as pass,
       'checklist share ' || checklist_share::varchar as detail
from share
