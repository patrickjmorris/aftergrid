-- Were the two months alike enough on weather for the comparison to mean anything?
-- comparable_weather_day v1 (proposed diagnostic): day n of the baseline month against day n of the after month
-- at station USW00094728, comparable when the maximum temperatures are within 5 degrees Celsius of each other
-- and both days fall in the same wet/dry class (under 1 mm, or 1 mm and over).
-- The bar, set before any weather number was read from these inputs: MORE THAN HALF of the aligned day pairs
-- are comparable.
-- This Check is required: false and its kind is invariant, not minimum_data, on purpose. A weather mismatch does
-- not make the ride counts insufficient and must not turn a descriptive count comparison into insufficient_data;
-- it is a fact about how alike the two months were, which the memo states either way. A passing weather Check
-- would not make the comparison causal, and version 1 of the rule does not test snow.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges, local New York dates).
with w as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(observation_date as DATE) as observation_date,
         cast(tmax_c as DOUBLE) as tmax_c,
         cast(prcp_mm as DOUBLE) as prcp_mm
  from weather_daily
),
a as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $base_from::DATE, observation_date) as offset_days
  from w
  where observation_date >= $base_from::DATE and observation_date < $base_to::DATE
),
b as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $after_from::DATE, observation_date) as offset_days
  from w
  where observation_date >= $after_from::DATE and observation_date < $after_to::DATE
),
paired as (
  select a.offset_days,
         abs(a.tmax_c - b.tmax_c) as tmax_gap_c,
         case when a.prcp_mm is null then 'unknown' when a.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_a,
         case when b.prcp_mm is null then 'unknown' when b.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_b,
         a.tmax_c as tmax_a_c, b.tmax_c as tmax_b_c
  from a join b on a.offset_days = b.offset_days
),
classed as (
  select case
           when tmax_a_c is null or tmax_b_c is null
                or prcp_class_a = 'unknown' or prcp_class_b = 'unknown' then 'unknown'
           when tmax_gap_c <= 5.0 and prcp_class_a = prcp_class_b then 'comparable'
           else 'not_comparable'
         end as weather_class
  from paired
),
agg as (
  select count(*) as all_pairs,
         count(*) filter (where weather_class = 'comparable') as comparable_pairs,
         count(*) filter (where weather_class = 'not_comparable') as not_comparable_pairs,
         count(*) filter (where weather_class = 'unknown') as unknown_pairs
  from classed
)
select case when all_pairs = 0 then null else comparable_pairs * 2 > all_pairs end as pass,
       'aligned day pairs ' || cast(all_pairs as VARCHAR)
         || '; comparable ' || cast(comparable_pairs as VARCHAR)
         || '; not comparable ' || cast(not_comparable_pairs as VARCHAR)
         || '; unknown ' || cast(unknown_pairs as VARCHAR)
         || '; bar is more than half comparable' as detail
from agg
