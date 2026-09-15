-- What exists since the price change: days elapsed, cancellations, subscriptions active at the change,
-- and the earliest date the policy minimum of $min_days full days is reached. One row, key 'post'.
-- Parameters: $tz, $change_date (date), $data_to (date, last full day of data), $min_days (integer).
-- Tables: subscriptions. No approved definition: cancellations are a diagnostic count.
with s as (
  select subscription_id,
         cast(timezone($tz, started_at::timestamptz) as date) as start_day,
         case when canceled_at is null or canceled_at = '' then null
              else cast(timezone($tz, canceled_at::timestamptz) as date) end as cancel_day
  from subscriptions
)
select 'post' as period,
       ($data_to::date - $change_date::date + 1)                                                  as days_elapsed,
       count(*) filter (where cancel_day >= $change_date::date and cancel_day <= $data_to::date)  as cancellations,
       count(*) filter (where start_day < $change_date::date
                          and (cancel_day is null or cancel_day >= $change_date::date))            as active_at_change,
       ($change_date::date + ($min_days::integer - 1))                                             as earliest_eligible_date
from s
