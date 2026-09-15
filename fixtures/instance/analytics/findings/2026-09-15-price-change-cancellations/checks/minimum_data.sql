-- Minimum-data gate from the analysis policy, on the declared population (subscriptions active at the start of
-- the change date): at least $min_days full days and $min_cancellations cancellations after the change before any
-- before/after comparison is made. Failing is a business result (insufficient data), not an engine failure.
with s as (
  select cast(timezone($tz, started_at::timestamptz) as date) as start_day,
         case when canceled_at is null or canceled_at = '' then null
              else cast(timezone($tz, canceled_at::timestamptz) as date) end as cancel_day
  from subscriptions
),
cohort as (
  select * from s where start_day < $change_date::date and (cancel_day is null or cancel_day >= $change_date::date)
),
x as (
  select ($data_to::date - $change_date::date + 1) as days_elapsed,
         count(*) filter (where cancel_day >= $change_date::date and cancel_day <= $data_to::date) as cancellations
  from cohort
)
select days_elapsed >= $min_days::integer and cancellations >= $min_cancellations::integer as pass,
       days_elapsed::varchar || ' days, ' || cancellations::varchar || ' cancellations in the cohort' as detail
from x
