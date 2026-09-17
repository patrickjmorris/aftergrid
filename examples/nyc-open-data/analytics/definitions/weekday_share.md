---
id: weekday_share
version: 1
kind: diagnostic
lifecycle: proposed
grain: one window, split by service and by in_crz
population: trips in crz_daily whose pickup date falls on a Monday through Friday
denominator: all trips in crz_daily in the same window and on the same side of in_crz, weekday and weekend together
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

**It reads `crz_daily`, the bounded table.** `trips_daily` at this Instance's window is over the admission cap,
so `aftergrid capture` refuses it whole and no Analysis here can retain it (`docs/contracts/adapters.md`, and
the same reason `crz_trip` v1 reads `crz_daily`). Naming a table an Analysis cannot capture makes a definition
that reads correctly and cannot be followed, which is what a `/analyze` run found. `crz_daily` holds every date
`trips_daily` holds — it is a smaller grain, not a smaller period — so the rule below is unchanged and this is
still **version 1**, `proposed`, with no `approval` block pinned to a previous content hash.

**`in_crz` is part of the grain, not a filter this definition applies.** `crz_daily` carries one row per pickup
date × service × `in_crz`, so the same window yields a weekday share for trips into the zone and one for the
rest. An Analysis states which side it is reading; a share quoted without saying which side is not this
diagnostic. Collapsing both sides gives the citywide share, and that has to be said too.

**Public holidays are not excluded**, and New Year's Day falls in every January window this Instance holds. A
holiday Wednesday counts as a weekday here even though the traffic on it does not behave like one. That is a
known limitation of version 1, not something the Check silently handles: name it in any Finding that leans on
this diagnostic.

**The date is the pickup date the TLC file carries**, which is local New York time; the build does no timezone
conversion, so a trip starting at 00:30 on Saturday is a Saturday trip.

## SQL (duckdb)

```sql
-- Parameters: $from (first pickup date, inclusive), $to (first pickup date after the window, exclusive).
-- Table: crz_daily, derived from trips_daily and crz_zones by scripts/derive-question-tables.mjs.
-- One row per service and side of in_crz: the Analysis says which side it reads, and says so in the Finding.
select service,
       in_crz,
       sum(trips) filter (where isodow(pickup_date) <= 5) as weekday_trips,
       sum(trips) as all_trips,
       sum(trips) filter (where isodow(pickup_date) <= 5) / nullif(sum(trips), 0)::DOUBLE as weekday_share,
       count(distinct pickup_date) filter (where isodow(pickup_date) <= 5) as weekday_days,
       count(distinct pickup_date) as days
from crz_daily
where service in ('yellow', 'hvfhs')
  and pickup_date >= $from::DATE
  and pickup_date < $to::DATE
group by 1, 2
order by 1, 2
```
