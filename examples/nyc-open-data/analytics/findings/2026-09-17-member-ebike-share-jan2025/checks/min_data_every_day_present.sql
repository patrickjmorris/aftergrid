-- Minimum data: both months are whole. Every calendar day of the baseline month and of the after month carries
-- a member row for both bike types, each with at least one ride, so neither month's share rests on a day that
-- is missing from the file.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges, local New York dates).
with rides as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date, member_casual, rideable_type, cast(rides as BIGINT) as rides
  from citibike_daily
),
scoped as (
  select * from rides
  where member_casual = 'member'
    and ((ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
      or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE))
),
per_day as (
  select ride_date,
         count(*) filter (where rideable_type = 'electric_bike' and rides > 0) as ebike_rows,
         count(*) filter (where rideable_type = 'classic_bike' and rides > 0) as classic_rows
  from scoped
  group by 1
),
agg as (
  select count(*) as days_present,
         count(*) filter (where ebike_rows >= 1 and classic_rows >= 1) as days_complete
  from per_day
),
expected as (
  select date_diff('day', $base_from::DATE, $base_to::DATE)
       + date_diff('day', $after_from::DATE, $after_to::DATE) as days_expected
)
select days_present = days_expected and days_complete = days_expected as pass,
       'days expected ' || cast(days_expected as VARCHAR)
         || ', days present ' || cast(days_present as VARCHAR)
         || ', days with member rides on both bike types ' || cast(days_complete as VARCHAR) as detail
from agg, expected
