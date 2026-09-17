-- Invariant: the day pairs the falsifier and the matched-pair queries read are what they are said to be. There
-- are exactly $pair_days pairs, each pairs a baseline-month day with an after-month day of the same day of the
-- week, no day is used twice, and both days of every pair have a row of trips into the zone.
-- Parameters: $base_from, $base_to, $after_from, $after_to, $pair_base_from, $pair_after_from, $pair_days.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
wx as (
  select cast(observation_date as DATE) as observation_date from weather_daily
),
daily as (
  select pickup_date, sum(trips) filter (where in_crz) as crz_trips
  from crz
  where service in ('yellow', 'hvfhs')
  group by 1
),
a as (
  select observation_date, date_diff('day', $pair_base_from::DATE, observation_date) as offset_days
  from wx
  where observation_date >= $pair_base_from::DATE
    and observation_date < $pair_base_from::DATE + $pair_days::INTEGER
),
b as (
  select observation_date, date_diff('day', $pair_after_from::DATE, observation_date) as offset_days
  from wx
  where observation_date >= $pair_after_from::DATE
    and observation_date < $pair_after_from::DATE + $pair_days::INTEGER
),
paired as (
  select a.offset_days, a.observation_date as day_a, b.observation_date as day_b,
         da.crz_trips as base_trips, db.crz_trips as after_trips
  from a join b on a.offset_days = b.offset_days
  left join daily da on da.pickup_date = a.observation_date
  left join daily db on db.pickup_date = b.observation_date
),
t as (
  select
    count(*) as n_pairs,
    count(distinct day_a) as distinct_a,
    count(distinct day_b) as distinct_b,
    count(*) filter (where isodow(day_a) <> isodow(day_b)) as different_day_of_week,
    count(*) filter (where not (day_a >= $base_from::DATE and day_a < $base_to::DATE
                            and day_b >= $after_from::DATE and day_b < $after_to::DATE)) as outside_months,
    count(*) filter (where base_trips is null or after_trips is null) as missing_trips
  from paired
)
select
  n_pairs = $pair_days::INTEGER and distinct_a = n_pairs and distinct_b = n_pairs
    and different_day_of_week = 0 and outside_months = 0 and missing_trips = 0 as pass,
  'pairs ' || n_pairs || ' of ' || $pair_days::INTEGER
    || '; pairs on different days of the week ' || different_day_of_week
    || '; pairs outside the two months ' || outside_months
    || '; pairs missing trips on either day ' || missing_trips as detail
from t
