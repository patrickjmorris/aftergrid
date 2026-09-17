-- Falsifier for the revision 2 Question, written before any revision 2 query existed and before trips per day
-- had been looked at by anyone.
-- The Answer names the direction in which average trips into the zone per weekday moved between the baseline
-- month and the after month, and separately the direction per weekend day (whole months, holidays counted as
-- weekdays, as weekday_share v1 is written). A direction is wrong if it does not hold among days that were alike:
-- day pairs matched on the day of the week ($pair_days days from $pair_base_from against the same number from
-- $pair_after_from), leaving out any pair with a public holiday on either side, keeping only pairs that are a
-- comparable_weather_day v1 pair (maximum temperature within 5.0 degrees C and the same dry/wet class at 1 mm).
-- Within those pairs the baseline days and the after days are equal in number, so their trip sums are compared.
-- pass = NULL (not evaluable) when a month is missing a day, when the pairing is not $pair_days same-day-of-week
-- pairs inside both months, when fewer than 5 comparable non-holiday weekday pairs exist, or when a day-type
-- average that is to be tested did not move at all. Weekend days are tested only with 3 or more such pairs.
-- Holidays: New Year's Day, and Martin Luther King Jr. Day (third Monday of January). No holiday table exists in
-- the Instance, so the dates are written here.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open pickup-date ranges, local New York dates),
--             $pair_base_from, $pair_after_from (first day of each aligned run), $pair_days (its length).
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
  select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'base' else 'after' end as period,
         case when isodow(pickup_date) <= 5 then 'weekday' else 'weekend' end as day_type,
         pickup_date,
         sum(trips) filter (where in_crz) as crz_trips
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
  group by 1, 2, 3
),
months as (
  select
    count(*) filter (where period = 'base') as base_days,
    count(*) filter (where period = 'after') as after_days,
    avg(crz_trips) filter (where period = 'base' and day_type = 'weekday') as base_weekday_avg,
    avg(crz_trips) filter (where period = 'after' and day_type = 'weekday') as after_weekday_avg,
    avg(crz_trips) filter (where period = 'base' and day_type = 'weekend') as base_weekend_avg,
    avg(crz_trips) filter (where period = 'after' and day_type = 'weekend') as after_weekend_avg
  from daily
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
  select p.offset_days, p.day_a, p.day_b,
         case when isodow(p.day_b) <= 5 then 'weekday' else 'weekend' end as day_type,
         isodow(p.day_a) = isodow(p.day_b) as same_day_of_week,
         p.day_a >= $base_from::DATE and p.day_a < $base_to::DATE
           and p.day_b >= $after_from::DATE and p.day_b < $after_to::DATE as inside_both_months,
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
),
pairs as (
  select
    count(*) as n_pairs,
    count(*) filter (where not same_day_of_week or not inside_both_months) as bad_pairs,
    count(*) filter (where day_type = 'weekday' and not holiday_pair and weather_class = 'comparable') as wd_pairs,
    count(*) filter (where day_type = 'weekend' and not holiday_pair and weather_class = 'comparable') as we_pairs,
    sum(base_trips) filter (where day_type = 'weekday' and not holiday_pair and weather_class = 'comparable') as wd_base_sum,
    sum(after_trips) filter (where day_type = 'weekday' and not holiday_pair and weather_class = 'comparable') as wd_after_sum,
    sum(base_trips) filter (where day_type = 'weekend' and not holiday_pair and weather_class = 'comparable') as we_base_sum,
    sum(after_trips) filter (where day_type = 'weekend' and not holiday_pair and weather_class = 'comparable') as we_after_sum
  from classed
)
select
  case
    when m.base_days <> date_diff('day', $base_from::DATE, $base_to::DATE)
      or m.after_days <> date_diff('day', $after_from::DATE, $after_to::DATE) then null
    when p.n_pairs <> $pair_days::INTEGER or p.bad_pairs > 0 then null
    when p.wd_pairs < 5 then null
    when sign(m.after_weekday_avg - m.base_weekday_avg) = 0 then null
    when p.we_pairs >= 3 and sign(m.after_weekend_avg - m.base_weekend_avg) = 0 then null
    else sign(p.wd_after_sum - p.wd_base_sum) = sign(m.after_weekday_avg - m.base_weekday_avg)
     and (p.we_pairs < 3 or sign(p.we_after_sum - p.we_base_sum) = sign(m.after_weekend_avg - m.base_weekend_avg))
  end as pass,
  'pairs ' || p.n_pairs || ', misaligned ' || p.bad_pairs
    || '; weekdays: whole-month average direction ' || cast(sign(m.after_weekday_avg - m.base_weekday_avg) as integer)
    || ', comparable non-holiday pairs ' || p.wd_pairs
    || ', direction within them ' || coalesce(cast(cast(sign(p.wd_after_sum - p.wd_base_sum) as integer) as varchar), 'none')
    || '; weekend days: whole-month average direction ' || cast(sign(m.after_weekend_avg - m.base_weekend_avg) as integer)
    || ', comparable non-holiday pairs ' || p.we_pairs
    || ', direction within them ' || coalesce(cast(cast(sign(p.we_after_sum - p.we_base_sum) as integer) as varchar), 'none')
    || case when p.we_pairs >= 3 then ' (tested)' else ' (not tested, fewer than 3 pairs)' end
    || '; days ' || m.base_days || ' and ' || m.after_days as detail
from months m cross join pairs p
