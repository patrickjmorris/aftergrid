---
id: weekly_cancellation_rate
version: 1
kind: metric
lifecycle: proposed
grain: subscription-week
population: paid subscriptions active at the start of the week
denominator: subscriptions active at the start of the week
window: one calendar week, Monday to Sunday, in America/New_York
owner: Dana Okafor
---
The **weekly cancellation rate** is the share of paid subscriptions active at the start of a week that were cancelled during that week.

This definition is *proposed*: it has not been approved by an Operator and a Finding may cite it only as a supporting or diagnostic value, never as the published decision metric.

## SQL (duckdb)
```sql
-- Parameters: $tz, $week_start (date). Tables: subscriptions.
with s as (
  select subscription_id,
         cast(timezone($tz, started_at::timestamptz) as date) as start_day,
         case when canceled_at is null or canceled_at = '' then null
              else cast(timezone($tz, canceled_at::timestamptz) as date) end as cancel_day
  from subscriptions
)
select $week_start as week_start,
       count(*) filter (where start_day < $week_start and (cancel_day is null or cancel_day >= $week_start)) as active_at_start,
       count(*) filter (where cancel_day >= $week_start and cancel_day < $week_start + 7) as cancelled,
       cancelled::decimal / nullif(active_at_start, 0) as weekly_cancellation_rate
from s
```
