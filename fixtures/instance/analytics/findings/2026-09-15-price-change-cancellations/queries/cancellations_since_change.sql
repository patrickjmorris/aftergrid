-- What exists since the price change for the declared population: subscriptions active at the start of the
-- change date. One row, key 'post'. Cancellations are counted only within that population.
-- Parameters: $tz, $change_date (date), $data_to (date, last full day of data), $min_days (integer),
--             $min_cancellations (integer). Tables: subscriptions. No approved definition: diagnostic counts.
with s as (
  select subscription_id,
         cast(timezone($tz, started_at::timestamptz) as date) as start_day,
         case when canceled_at is null or canceled_at = '' then null
              else cast(timezone($tz, canceled_at::timestamptz) as date) end as cancel_day
  from subscriptions
),
cohort as (
  select * from s where start_day < $change_date::date and (cancel_day is null or cancel_day >= $change_date::date)
),
x as (
  select ($data_to::date - $change_date::date + 1)                                                 as days_elapsed,
         count(*) filter (where cancel_day >= $change_date::date and cancel_day <= $data_to::date) as cancellations,
         count(*)                                                                                  as active_at_change
  from cohort
)
select 'post' as period,
       days_elapsed,
       cancellations,
       active_at_change,
       ($change_date::date + ($min_days::integer - 1))                                             as earliest_window_end,
       case when days_elapsed >= $min_days::integer and cancellations >= $min_cancellations::integer then 1 else 0 end as minimum_met
from x
