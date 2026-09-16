-- Reconciliation: the retained count in the analysis query equals the count produced by the
-- canonical retained_7d v2 definition SQL applied to the same cohort, computed with a join rather than EXISTS.
-- Returns one row: pass boolean, detail text.
with cohort as (
  select user_id, cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day
  from users where onboarding_variant in ('checklist', 'control')
),
w as (select * from cohort where signup_day between $exp_start::date and $exp_end::date),
opens as (
  select user_id, cast(timezone($tz, "timestamp"::timestamptz) as date) as open_day
  from events where event = 'app_open'
),
by_join as (
  select count(distinct w.user_id) as retained
  from w join opens o on o.user_id = w.user_id and o.open_day between w.signup_day + 1 and w.signup_day + 7
),
by_definition as (
  select count(*) filter (where retained_7d) as retained
  from (
    select c.user_id, exists (select 1 from opens o where o.user_id = c.user_id
                              and o.open_day between c.signup_day + 1 and c.signup_day + 7) as retained_7d
    from w c
  )
)
select j.retained = d.retained as pass,
       'join ' || j.retained::varchar || ' vs definition ' || d.retained::varchar as detail
from by_join j, by_definition d
