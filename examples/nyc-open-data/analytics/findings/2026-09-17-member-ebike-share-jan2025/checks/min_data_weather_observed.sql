-- Minimum data: every day of both months carries a maximum temperature and a precipitation observation at one
-- station, so no aligned day pair is 'unknown' for want of data. comparable_weather_day v1 counts a pair with a
-- missing observation as unknown rather than as a match or a mismatch, so this Check is what makes the weather
-- comparison below read as a statement about weather and not about coverage.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges, local New York dates).
with w as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(observation_date as DATE) as observation_date,
         station_id,
         cast(tmax_c as DOUBLE) as tmax_c,
         cast(prcp_mm as DOUBLE) as prcp_mm
  from weather_daily
),
scoped as (
  select * from w
  where (observation_date >= $base_from::DATE and observation_date < $base_to::DATE)
     or (observation_date >= $after_from::DATE and observation_date < $after_to::DATE)
),
agg as (
  select count(distinct observation_date) as days_observed,
         count(*) filter (where tmax_c is null) as missing_tmax,
         count(*) filter (where prcp_mm is null) as missing_prcp,
         count(distinct station_id) as stations
  from scoped
),
expected as (
  select date_diff('day', $base_from::DATE, $base_to::DATE)
       + date_diff('day', $after_from::DATE, $after_to::DATE) as days_expected
)
select days_observed = days_expected and missing_tmax = 0 and missing_prcp = 0 as pass,
       'days expected ' || cast(days_expected as VARCHAR)
         || ', days observed ' || cast(days_observed as VARCHAR)
         || ', missing maximum temperatures ' || cast(missing_tmax as VARCHAR)
         || ', missing precipitation ' || cast(missing_prcp as VARCHAR)
         || ', stations ' || cast(stations as VARCHAR) as detail
from agg, expected
