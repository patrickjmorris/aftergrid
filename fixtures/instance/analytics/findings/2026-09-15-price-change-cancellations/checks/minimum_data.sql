-- Minimum-data gate from the analysis policy: at least $min_days full days and $min_cancellations cancellations
-- after the change before any before/after comparison is made. Failing this Check is a business result
-- (insufficient data), not an engine failure. Returns one row: pass boolean, detail text.
with s as (
  select case when canceled_at is null or canceled_at = '' then null
              else cast(timezone($tz, canceled_at::timestamptz) as date) end as cancel_day
  from subscriptions
),
x as (
  select ($data_to::date - $change_date::date + 1) as days_elapsed,
         count(*) filter (where cancel_day >= $change_date::date and cancel_day <= $data_to::date) as cancellations
  from s
)
select days_elapsed >= $min_days::integer and cancellations >= $min_cancellations::integer as pass,
       days_elapsed::varchar || ' days, ' || cancellations::varchar || ' cancellations' as detail
from x
