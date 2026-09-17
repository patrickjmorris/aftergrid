-- Invariant: across both months the only bike types present are classic_bike and electric_bike, so the e-bike
-- share of member rides is a two-way split. ebike_ride v1 requires this to be checked rather than assumed,
-- because Citi Bike has used a third value, docked_bike, in earlier files. If a third value were present the
-- share would have a different denominator and every share on this Finding would be wrong.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges, local New York dates).
with rides as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date, rideable_type
  from citibike_daily
),
scoped as (
  select * from rides
  where (ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
     or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE)
),
agg as (
  select count(distinct rideable_type) as type_count,
         count(*) filter (where rideable_type not in ('classic_bike', 'electric_bike')) as unexpected_rows,
         string_agg(distinct rideable_type, ', ' order by rideable_type) as types
  from scoped
)
select type_count = 2 and unexpected_rows = 0 as pass,
       'bike types present: ' || types || '; rows with an unexpected bike type '
         || cast(unexpected_rows as VARCHAR) as detail
from agg
