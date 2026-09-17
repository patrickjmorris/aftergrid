-- comparable_weather_day v1 (diagnostic, proposed), SQL as written in the definition, with the baseline month as
-- period A and the after month as period B, aligned by day offset; then counted by class. Every class is
-- returned, including a class with no pairs. Snow is not in the v1 rule.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with wx as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(observation_date as DATE) as observation_date, station_id, cast(tmax_c as DOUBLE) as tmax_c,
         cast(prcp_mm as DOUBLE) as prcp_mm, cast(snow_mm as DOUBLE) as snow_mm
  from weather_daily
),
a as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $base_from::DATE, observation_date) as offset_days
  from wx
  where observation_date >= $base_from::DATE and observation_date < $base_to::DATE
),
b as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $after_from::DATE, observation_date) as offset_days
  from wx
  where observation_date >= $after_from::DATE and observation_date < $after_to::DATE
),
paired as (
  select a.offset_days,
         a.tmax_c as tmax_a_c, b.tmax_c as tmax_b_c,
         abs(a.tmax_c - b.tmax_c) as tmax_gap_c,
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
classes as (
  select * from (values ('comparable', 'Comparable weather', 1), ('not_comparable', 'Not comparable', 2),
                        ('unknown', 'No observation', 3)) t(weather_class, class_label, sort_order)
)
select c.weather_class,
       c.class_label,
       cast(count(k.weather_class) as BIGINT) as day_pairs,
       cast((select count(*) from paired) as BIGINT) as all_day_pairs
from classes c left join classed k on k.weather_class = c.weather_class
group by c.weather_class, c.class_label, c.sort_order
order by c.sort_order
