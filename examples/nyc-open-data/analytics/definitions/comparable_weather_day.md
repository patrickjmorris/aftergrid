---
id: comparable_weather_day
version: 1
kind: diagnostic
lifecycle: proposed
grain: one pair of days, the nth day of period A against the nth day of period B
population: pairs of aligned days where both days have a TMAX and a PRCP observation at station USW00094728
denominator: every aligned day pair in the two periods, including the pairs where one side has no observation
window: two periods of equal length, aligned by day offset from each period's first day
owner: Patrick Morris
---
Two days are a **comparable weather day** pair when both of these hold at station `USW00094728` (New York City,
Central Park):

1. their daily maximum temperatures are within **±5 °C** of each other, and
2. they fall in the same **precipitation class** — *dry* (under 1 mm of precipitation) or *wet* (1 mm or more).

Units come straight from `weather_daily`, and they are not the units GHCN publishes: `tmax_c` and `tmin_c` are
**degrees Celsius** (GHCN publishes tenths of a degree; the build divides by 10), `prcp_mm` is **millimetres**
(also tenths in the source), and `snow_mm` is **millimetres** (already millimetres in the source). A value GHCN
flagged as failing a quality check is dropped by the build rather than carried, so a missing day is missing and
not zero.

**A pair with a missing observation is `unknown`, never comparable and never "not comparable".** If either day
has no TMAX or no PRCP, there is nothing to compare, and the Check has to report the pair as unknown and count
it. Treating a gap as a mismatch would understate comparability; treating it as a match would invent one.

**Snow is not in the rule, and that is a limitation, not an omission by accident.** `snow_mm` is in
`weather_daily` and a snow day changes taxi demand at the same temperature and precipitation class as a rainy
one. A version 2 of this definition should either add a snow class or say why it does not; version 1 is a
temperature-and-precipitation rule and any Finding using it must say that in those words.

This is a **diagnostic calculation**, not a metric. It never headlines a Claim. Its job is to let a Check say
whether two periods were alike enough on weather for a comparison between them to mean anything — and a passing
Check does not make a comparison causal.

## SQL (duckdb)

```sql
-- Parameters: $a_start, $b_start (first day of each period), $days (length of both periods).
-- Tables: weather_daily.
with a as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $a_start::DATE, observation_date) as offset_days
  from weather_daily
  where observation_date >= $a_start::DATE
    and observation_date < $a_start::DATE + $days::INTEGER
),
b as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $b_start::DATE, observation_date) as offset_days
  from weather_daily
  where observation_date >= $b_start::DATE
    and observation_date < $b_start::DATE + $days::INTEGER
),
paired as (
  select a.offset_days,
         a.observation_date as day_a, b.observation_date as day_b,
         a.tmax_c as tmax_a_c, b.tmax_c as tmax_b_c,
         abs(a.tmax_c - b.tmax_c) as tmax_gap_c,
         case when a.prcp_mm is null then 'unknown' when a.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_a,
         case when b.prcp_mm is null then 'unknown' when b.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_b
  from a join b on a.offset_days = b.offset_days
)
select offset_days, day_a, day_b, tmax_a_c, tmax_b_c, tmax_gap_c, prcp_class_a, prcp_class_b,
       case
         when tmax_a_c is null or tmax_b_c is null
              or prcp_class_a = 'unknown' or prcp_class_b = 'unknown' then 'unknown'
         when tmax_gap_c <= 5.0 and prcp_class_a = prcp_class_b then 'comparable'
         else 'not_comparable'
       end as comparable_weather_day
from paired
order by offset_days
```
