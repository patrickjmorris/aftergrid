-- The day pairs themselves, one row per pair, so a reader of the evidence can see which days were set against
-- which, what the weather was, and which pairs the falsifier kept. Same pairing, same comparable_weather_day v1
-- rule (diagnostic, proposed) and same holiday dates as checks/falsifier_direction_holds_in_matched_weather_pairs.sql.
-- tmax is degrees Celsius. Daily totals of two public aggregates; no trip record and no person is in this table.
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
)
select 'pair_' || lpad(cast(p.offset_days + 1 as varchar), 2, '0') as pair_id,
       p.day_a as baseline_day,
       p.day_b as after_day,
       dayname(p.day_b) as day_name,
       case when isodow(p.day_b) <= 5 then 'weekday' else 'weekend' end as day_type,
       (p.day_a in (select holiday_date from holidays) or p.day_b in (select holiday_date from holidays)) as holiday_pair,
       cast(p.tmax_a_c as DECIMAL(18,1)) as baseline_tmax_c,
       cast(p.tmax_b_c as DECIMAL(18,1)) as after_tmax_c,
       p.prcp_class_a as baseline_prcp_class,
       p.prcp_class_b as after_prcp_class,
       case
         when p.tmax_a_c is null or p.tmax_b_c is null
              or p.prcp_class_a = 'unknown' or p.prcp_class_b = 'unknown' then 'unknown'
         when p.tmax_gap_c <= 5.0 and p.prcp_class_a = p.prcp_class_b then 'comparable'
         else 'not_comparable'
       end as weather_class,
       cast(da.crz_trips as BIGINT) as baseline_crz_trips,
       cast(db.crz_trips as BIGINT) as after_crz_trips
from paired p
left join daily da on da.pickup_date = p.day_a
left join daily db on db.pickup_date = p.day_b
order by p.offset_days
