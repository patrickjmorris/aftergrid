-- Daily series of member rides and the e-bike share of them, across both months, so one month either side is
-- visible as 31 days rather than as a single number. Days are aligned by day of the month, which is how
-- comparable_weather_day v1 pairs them.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges).
with rides as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(ride_date as DATE) as ride_date,
         member_casual,
         rideable_type,
         cast(rides as BIGINT) as rides
  from citibike_daily
)
select ride_date,
       case when ride_date >= $base_from::DATE and ride_date < $base_to::DATE then 'baseline' else 'after' end as period,
       strftime(ride_date, '%B %Y') as period_label,
       cast(day(ride_date) as BIGINT) as day_of_month,
       dayname(ride_date) as day_name,
       cast(sum(rides) as BIGINT) as member_rides,
       cast(sum(rides) filter (where rideable_type = 'electric_bike') as BIGINT) as member_ebike_rides,
       cast(sum(rides) filter (where rideable_type = 'electric_bike') / nullif(sum(rides), 0)::DOUBLE as DECIMAL(18,6)) as member_ebike_share
from rides
where member_casual = 'member'
  and ((ride_date >= $base_from::DATE and ride_date < $base_to::DATE)
    or (ride_date >= $after_from::DATE and ride_date < $after_to::DATE))
group by 1, 2, 3, 4, 5
order by ride_date
