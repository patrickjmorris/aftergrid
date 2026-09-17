-- The pre-registered comparison: member rides (member_ride v1, proposed) split by bike type (ebike_ride v1,
-- proposed) for the baseline month and the after month, with the e-bike share of member rides and the totals
-- the share sits on top of. The share's denominator is all member rides in the same month, electric and classic
-- together, which is the denominator ebike_ride v1 names.
-- ride_date is already the local New York start date the Citi Bike file carries; no timezone conversion is applied.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges).
with rides as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date,
         member_casual,
         rideable_type,
         cast(rides as BIGINT) as rides,
         cast(duration_seconds_sum as BIGINT) as duration_seconds_sum
  from citibike_daily
)
select case when ride_date >= $base_from::DATE and ride_date < $base_to::DATE then 'baseline' else 'after' end as period,
       strftime(min(ride_date), '%B %Y') as period_label,
       min(ride_date) as first_day,
       max(ride_date) as last_day,
       cast(count(distinct ride_date) as BIGINT) as days,
       cast(sum(rides) as BIGINT) as member_rides,
       cast(sum(rides) filter (where rideable_type = 'electric_bike') as BIGINT) as member_ebike_rides,
       cast(sum(rides) filter (where rideable_type = 'classic_bike') as BIGINT) as member_classic_rides,
       cast(sum(rides) filter (where rideable_type = 'electric_bike') / nullif(sum(rides), 0)::DOUBLE as DECIMAL(18,6)) as member_ebike_share,
       cast(sum(rides) / count(distinct ride_date)::DOUBLE as DECIMAL(18,1)) as member_rides_per_day,
       cast(sum(rides) filter (where rideable_type = 'electric_bike') / count(distinct ride_date)::DOUBLE as DECIMAL(18,1)) as member_ebike_rides_per_day
from rides
where member_casual = 'member'
  and ((ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
    or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE))
group by 1
order by first_day
