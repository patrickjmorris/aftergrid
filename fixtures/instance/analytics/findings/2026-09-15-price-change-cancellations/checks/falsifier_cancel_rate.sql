-- Falsifier for the Question: once the minimum-data gate is met, the belief "the price change did not
-- raise cancellations" is wrong if the post-change daily cancellation rate exceeds the pre-change rate
-- (the $min_days days before the change) by more than 20% relative. Until the gate is met, pass is NULL: not evaluable.
-- Expected outcome: pass.
with s as (
  select cast(timezone($tz, started_at::timestamptz) as date) as start_day,
         case when canceled_at is null or canceled_at = '' then null
              else cast(timezone($tz, canceled_at::timestamptz) as date) end as cancel_day
  from subscriptions
),
x as (
  select ($data_to::date - $change_date::date + 1) as days_elapsed,
         count(*) filter (where cancel_day >= $change_date::date and cancel_day <= $data_to::date) as post_cancellations,
         count(*) filter (where start_day < $change_date::date and (cancel_day is null or cancel_day >= $change_date::date)) as post_active,
         count(*) filter (where cancel_day >= $change_date::date - $min_days::integer and cancel_day < $change_date::date) as pre_cancellations,
         count(*) filter (where start_day < $change_date::date - $min_days::integer
                            and (cancel_day is null or cancel_day >= $change_date::date - $min_days::integer)) as pre_active
  from s
)
select case when days_elapsed < $min_days::integer or post_cancellations < $min_cancellations::integer then null
            else (post_cancellations::decimal(12,6) / nullif(post_active, 0) / days_elapsed)
                 <= 1.2 * (pre_cancellations::decimal(12,6) / nullif(pre_active, 0) / $min_days::integer) end as pass,
       'post ' || post_cancellations::varchar || '/' || post_active::varchar || ' over ' || days_elapsed::varchar || ' days; pre '
         || pre_cancellations::varchar || '/' || pre_active::varchar as detail
from x
