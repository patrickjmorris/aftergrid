-- What the falsifier reads, counted and summed by day type. Day pairs matched on the day of the week ($pair_days
-- days from $pair_base_from against the same number from $pair_after_from), classed by comparable_weather_day v1
-- (diagnostic, proposed; maximum temperature within 5.0 degrees C and the same dry/wet class at 1 mm; snow is
-- not in the v1 rule). A pair with a public holiday on either side is counted apart and left out of every other
-- column. Trip sums are over the comparable non-holiday pairs only, baseline days and after days equal in number.
-- Parameters: $base_from, $base_to, $after_from, $after_to, $pair_base_from, $pair_after_from, $pair_days.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
wx as (
  select cast(observation_date as DATE) as observation_date, cast(tmax_c as DOUBLE) as tmax_c, cast(prcp_mm as DOUBLE) as prcp_mm
  from weather_daily
),
holidays as (
  select * from (values (DATE '2024-01-01'), (DATE '2024-01-15'), (DATE '2025-01-01'), (DATE '2025-01-20')) t(holiday_date)
),
daily as (
  select pickup_date, sum(trips) filter (where in_crz) as crz_trips
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
  group by 1
),
a as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $pair_base_from::DATE, observation_date) as offset_days
  from wx
  where observation_date >= $pair_base_from::DATE
    and observation_date < $pair_base_from::DATE + $pair_days::INTEGER
),
b as (
  select observation_date, tmax_c, prcp_mm,
         date_diff('day', $pair_after_from::DATE, observation_date) as offset_days
  from wx
  where observation_date >= $pair_after_from::DATE
    and observation_date < $pair_after_from::DATE + $pair_days::INTEGER
),
paired as (
  select a.offset_days,
         a.observation_date as day_a, b.observation_date as day_b,
         a.tmax_c as tmax_a_c, b.tmax_c as tmax_b_c,
         abs(a.tmax_c - b.tmax_c) as tmax_gap_c,
         case when a.prcp_mm is null then 'unknown' when a.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_a,
         case when b.prcp_mm is null then 'unknown' when b.prcp_mm < 1 then 'dry' else 'wet' end as prcp_class_b
  from a join b on a.offset_days = b.offset_days
),
classed as (
  select case when isodow(p.day_b) <= 5 then 'weekday' else 'weekend' end as day_type,
         (p.day_a in (select holiday_date from holidays) or p.day_b in (select holiday_date from holidays)) as holiday_pair,
         case
           when p.tmax_a_c is null or p.tmax_b_c is null
                or p.prcp_class_a = 'unknown' or p.prcp_class_b = 'unknown' then 'unknown'
           when p.tmax_gap_c <= 5.0 and p.prcp_class_a = p.prcp_class_b then 'comparable'
           else 'not_comparable'
         end as weather_class,
         da.crz_trips as base_trips,
         db.crz_trips as after_trips
  from paired p
  left join daily da on da.pickup_date = p.day_a
  left join daily db on db.pickup_date = p.day_b
)
select day_type,
       case day_type when 'weekday' then 'Weekdays' else 'Weekend days' end as day_type_label,
       cast(count(*) as BIGINT) as matched_pairs,
       cast(count(*) filter (where holiday_pair) as BIGINT) as holiday_pairs,
       cast(count(*) filter (where not holiday_pair and weather_class = 'comparable') as BIGINT) as comparable_pairs,
       cast(count(*) filter (where not holiday_pair and weather_class = 'not_comparable') as BIGINT) as not_comparable_pairs,
       cast(count(*) filter (where not holiday_pair and weather_class = 'unknown') as BIGINT) as unknown_pairs,
       cast(sum(base_trips) filter (where not holiday_pair and weather_class = 'comparable') as BIGINT) as base_crz_trips,
       cast(sum(after_trips) filter (where not holiday_pair and weather_class = 'comparable') as BIGINT) as after_crz_trips,
       cast(avg(base_trips) filter (where not holiday_pair and weather_class = 'comparable') as DECIMAL(18,1)) as base_crz_trips_per_day,
       cast(avg(after_trips) filter (where not holiday_pair and weather_class = 'comparable') as DECIMAL(18,1)) as after_crz_trips_per_day
from classed
group by day_type
order by day_type
