-- Invariant: inside both months citibike_daily has one row per ride date, member type and bike type, carries
-- only the two member types, and has no missing or negative ride count or duration. Nothing is double counted.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges, local New York dates).
with rides as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date,
         member_casual,
         rideable_type,
         cast(rides as BIGINT) as rides,
         cast(duration_seconds_sum as BIGINT) as duration_seconds_sum
  from citibike_daily
),
scoped as (
  select * from rides
  where (ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
     or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE)
),
agg as (
  select
    count(*) as row_count,
    count(distinct cast(ride_date as VARCHAR) || '|' || member_casual || '|' || rideable_type) as distinct_grain,
    count(*) filter (where rides is null or rides < 0) as bad_rides,
    count(*) filter (where duration_seconds_sum is null or duration_seconds_sum < 0) as bad_duration,
    count(*) filter (where member_casual not in ('member', 'casual')) as bad_member_type,
    count(distinct ride_date) as days
  from scoped
)
select
  row_count = distinct_grain
  and bad_rides = 0
  and bad_duration = 0
  and bad_member_type = 0
  and days = date_diff('day', $base_from::DATE, $base_to::DATE) + date_diff('day', $after_from::DATE, $after_to::DATE)
    as pass,
  'rows ' || cast(row_count as VARCHAR) || ', distinct date/member-type/bike-type combinations '
    || cast(distinct_grain as VARCHAR)
    || '; missing or negative ride counts ' || cast(bad_rides as VARCHAR)
    || '; missing or negative durations ' || cast(bad_duration as VARCHAR)
    || '; rows with an unexpected member type ' || cast(bad_member_type as VARCHAR)
    || '; distinct ride dates ' || cast(days as VARCHAR) as detail
from agg
