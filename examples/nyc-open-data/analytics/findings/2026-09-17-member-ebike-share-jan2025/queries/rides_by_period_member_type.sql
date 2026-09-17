-- The same comparison for members and for casual riders side by side, so the e-bike share of member rides can
-- be read against the e-bike share of casual rides rather than on its own. ebike_ride v1 warns that the share
-- of member rides on e-bikes, the share of all rides on e-bikes and the share of e-bike rides taken by members
-- are three different numbers; this query carries the member type on every row so the one on the page is named.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges).
with rides as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date,
         member_casual,
         rideable_type,
         cast(rides as BIGINT) as rides
  from citibike_daily
),
scoped as (
  select case when ride_date >= $base_from::DATE and ride_date < $base_to::DATE then 'baseline' else 'after' end as period,
         ride_date, member_casual, rideable_type, rides
  from rides
  where (ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
     or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE)
)
select period || '_' || member_casual as period_member_type,
       period,
       strftime(min(ride_date), '%B %Y') as period_label,
       member_casual,
       case when member_casual = 'member' then 'Members' else 'Casual riders' end as member_type_label,
       cast(sum(rides) as BIGINT) as all_rides,
       cast(sum(rides) filter (where rideable_type = 'electric_bike') as BIGINT) as ebike_rides,
       cast(sum(rides) filter (where rideable_type = 'electric_bike') / nullif(sum(rides), 0)::DOUBLE as DECIMAL(18,6)) as ebike_share
from scoped
group by 1, 2, 4, 5
order by member_casual, min(ride_date)
