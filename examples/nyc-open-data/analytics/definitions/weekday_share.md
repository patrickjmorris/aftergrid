---
id: weekday_share
version: 1
kind: diagnostic
lifecycle: proposed
grain: one window, optionally split by service
population: trips in trips_daily whose pickup date falls on a Monday through Friday
denominator: all trips in trips_daily in the same window, weekday and weekend together
window: stated per Analysis as a half-open range of pickup dates; the day of the week is taken from pickup_date, which is local New York time
owner: Patrick Morris
---
The **weekday share** is the share of trips in a window whose pickup date is a Monday, Tuesday, Wednesday,
Thursday or Friday. Saturday and Sunday are the rest of the denominator. `isodow(pickup_date)` returns 1 for
Monday and 7 for Sunday, and this uses `<= 5`.

It is a **diagnostic calculation**, not a metric: it never headlines a Claim. Its job is to catch a comparison
that is really a calendar difference. Two Januaries do not hold the same number of weekdays — January 2024 had
23 and January 2025 had 23, but January 2023 had 22 — and a congestion charge that bites on commuting traffic
will move weekday and weekend trips differently. A before-and-after count that moves with the weekday share has
a calendar explanation in front of a behavioural one.

**Public holidays are not excluded**, and New Year's Day falls in every January window this Instance holds. A
holiday Wednesday counts as a weekday here even though the traffic on it does not behave like one. That is a
known limitation of version 1, not something the Check silently handles: name it in any Finding that leans on
this diagnostic.

**The date is the pickup date the TLC file carries**, which is local New York time; the build does no timezone
conversion, so a trip starting at 00:30 on Saturday is a Saturday trip.

## SQL (duckdb)

```sql
-- Parameters: $from (first pickup date, inclusive), $to (first pickup date after the window, exclusive).
-- Tables: trips_daily.
select service,
       sum(trips) filter (where isodow(pickup_date) <= 5) as weekday_trips,
       sum(trips) as all_trips,
       sum(trips) filter (where isodow(pickup_date) <= 5) / nullif(sum(trips), 0)::DOUBLE as weekday_share,
       count(distinct pickup_date) filter (where isodow(pickup_date) <= 5) as weekday_days,
       count(distinct pickup_date) as days
from trips_daily
where pickup_date >= $from::DATE
  and pickup_date < $to::DATE
group by 1
order by 1
```
