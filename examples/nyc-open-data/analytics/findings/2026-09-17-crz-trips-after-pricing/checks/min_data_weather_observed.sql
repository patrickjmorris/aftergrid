-- Minimum data for the weather diagnostic: every day of both windows has a maximum temperature and a
-- precipitation observation, all from one station, so no aligned day pair is 'unknown' for lack of data.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with wx as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(observation_date as DATE) as observation_date, station_id, cast(tmax_c as DOUBLE) as tmax_c,
         cast(prcp_mm as DOUBLE) as prcp_mm, cast(snow_mm as DOUBLE) as snow_mm
  from weather_daily
),
w as (
  select * from wx
  where (observation_date >= $base_from::DATE and observation_date < $base_to::DATE)
     or (observation_date >= $after_from::DATE and observation_date < $after_to::DATE)
)
select
  (select count(*) from w where tmax_c is not null and prcp_mm is not null)
    = date_diff('day', $base_from::DATE, $base_to::DATE) + date_diff('day', $after_from::DATE, $after_to::DATE)
  and (select count(distinct station_id) from w) = 1 as pass,
  'days with both observations ' || (select count(*) from w where tmax_c is not null and prcp_mm is not null)
    || ' of ' || (date_diff('day', $base_from::DATE, $base_to::DATE) + date_diff('day', $after_from::DATE, $after_to::DATE))
    || '; stations ' || (select count(distinct station_id) from w) as detail
