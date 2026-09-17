-- Invariant: the totals the analysis computes equal the totals the two definitions' own SQL returns as written.
-- member_ride v1 and ebike_ride v1 are both proposed and carry no approval, so this is not a reconciliation
-- against an approved definition - none exists in this Instance. It shows that the analysis follows the text of
-- the definitions it names, and that the two definitions agree with each other where they overlap.
-- Three equalities, over both months together:
--   1. all member rides, the analysis aggregation against member_ride v1 summed over its rows;
--   2. member rides on e-bikes, the analysis aggregation against ebike_ride v1 restricted to member rides;
--   3. member_ride v1 restricted to electric_bike against ebike_ride v1 restricted to member - the overlap.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges, local New York dates).
with base as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date, member_casual, rideable_type, cast(rides as BIGINT) as rides
  from citibike_daily
),
win as (
  select * from base
  where (ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
     or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE)
),
member_ride_v1 as (
  select ride_date, rideable_type, sum(rides) as member_rides
  from win
  where member_casual = 'member'
  group by 1, 2
),
ebike_ride_v1 as (
  select ride_date, member_casual, sum(rides) as ebike_rides
  from win
  where rideable_type = 'electric_bike'
  group by 1, 2
),
analysis as (
  select sum(rides) as member_rides_total,
         sum(rides) filter (where rideable_type = 'electric_bike') as member_ebike_total
  from win
  where member_casual = 'member'
),
cmp as (
  select (select sum(member_rides) from member_ride_v1) as def_member_rides,
         (select sum(ebike_rides) from ebike_ride_v1 where member_casual = 'member') as def_member_ebike,
         (select sum(member_rides) from member_ride_v1 where rideable_type = 'electric_bike') as overlap_member_side,
         (select member_rides_total from analysis) as analysis_member_rides,
         (select member_ebike_total from analysis) as analysis_member_ebike
)
select def_member_rides = analysis_member_rides
   and def_member_ebike = analysis_member_ebike
   and overlap_member_side = def_member_ebike as pass,
  'member_ride v1 total ' || cast(def_member_rides as VARCHAR)
    || ' vs analysis ' || cast(analysis_member_rides as VARCHAR)
    || '; ebike_ride v1 member total ' || cast(def_member_ebike as VARCHAR)
    || ' vs analysis ' || cast(analysis_member_ebike as VARCHAR)
    || '; member_ride v1 restricted to e-bikes ' || cast(overlap_member_side as VARCHAR) as detail
from cmp
