-- Falsifier for the Question, written at the clarify stage, before any analysis query existed and before any
-- ride total, e-bike total or share had been computed.
-- The Answer names one direction for member e-bike riding between the baseline month and the after month.
-- It is wrong if the two ways of reading "more" disagree: if the number of member rides on e-bikes and the
-- share of member rides that were on e-bikes did not move the same way.
-- pass = NULL (not evaluable) when either month is missing a day, or when either measure is exactly equal
-- across the two months, because there is then no direction to agree about.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges, local New York dates).
with rides as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date,
         member_casual,
         rideable_type,
         cast(rides as BIGINT) as rides
  from citibike_daily
),
scoped as (
  select case when ride_date >= $base_from::DATE and ride_date < $base_to::DATE then 'base' else 'after' end as period,
         ride_date,
         rideable_type,
         rides
  from rides
  where member_casual = 'member'
    and ((ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
      or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE))
),
agg as (
  select
    count(distinct ride_date) filter (where period = 'base') as base_days,
    count(distinct ride_date) filter (where period = 'after') as after_days,
    sum(rides) filter (where period = 'base' and rideable_type = 'electric_bike') as base_ebike,
    sum(rides) filter (where period = 'after' and rideable_type = 'electric_bike') as after_ebike,
    sum(rides) filter (where period = 'base') as base_member_rides,
    sum(rides) filter (where period = 'after') as after_member_rides
  from scoped
),
m as (
  select *,
         base_ebike / nullif(base_member_rides, 0)::DOUBLE as base_share,
         after_ebike / nullif(after_member_rides, 0)::DOUBLE as after_share
  from agg
)
select
  case
    when base_days <> date_diff('day', $base_from::DATE, $base_to::DATE)
      or after_days <> date_diff('day', $after_from::DATE, $after_to::DATE) then null
    when base_ebike is null or after_ebike is null or base_share is null or after_share is null then null
    when after_ebike = base_ebike or after_share = base_share then null
    else sign(after_ebike - base_ebike) = sign(after_share - base_share)
  end as pass,
  'member e-bike rides ' || cast(base_ebike as VARCHAR) || ' -> ' || cast(after_ebike as VARCHAR)
    || ' (direction ' || cast(sign(after_ebike - base_ebike) as INTEGER) || ')'
    || '; e-bike share of member rides ' || cast(round(base_share * 100, 2) as VARCHAR) || '% -> '
    || cast(round(after_share * 100, 2) as VARCHAR) || '%'
    || ' (direction ' || cast(sign(after_share - base_share) as INTEGER) || ')'
    || '; days ' || cast(base_days as VARCHAR) || ' and ' || cast(after_days as VARCHAR) as detail
from m
