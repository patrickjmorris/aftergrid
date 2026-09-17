-- comparable_weather_day v1 (proposed diagnostic) applied to the two months: day n of the baseline month
-- against day n of the after month at station USW00094728, counted by class. All three classes are listed,
-- including the ones with no pairs, so a zero is a zero and not a missing row.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges).
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
         a.tmax_c as tmax_a_c, b.tmax_c as tmax_b_c,
         case when a.prcp_mm is null then 'unknown' when a.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_a,
         case when b.prcp_mm is null then 'unknown' when b.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_b
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
labels(weather_class, class_label) as (
  values ('comparable', 'Alike on weather'),
         ('not_comparable', 'Not alike on weather'),
         ('unknown', 'No observation on one or both days')
)
select l.weather_class,
       l.class_label,
       cast(count(c.weather_class) as BIGINT) as day_pairs,
       cast((select count(*) from classed) as BIGINT) as all_day_pairs
from labels l
left join classed c on c.weather_class = l.weather_class
group by 1, 2
order by 1
