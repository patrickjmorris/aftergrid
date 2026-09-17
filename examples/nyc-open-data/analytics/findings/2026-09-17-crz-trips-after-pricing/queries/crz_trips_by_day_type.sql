-- Secondary, fixed before any number was seen: trips into the zone per day, weekdays and weekend days apart,
-- which is what the falsifier Check reads. Public holidays are not separated (weekday_share v1 does not either).
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
daily as (
  select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'baseline' else 'after' end as period,
         case when isodow(pickup_date) <= 5 then 'weekday' else 'weekend' end as day_type,
         pickup_date,
         sum(trips) filter (where in_crz) as crz_trips
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
  group by 1, 2, 3
)
select period || '_' || day_type as period_day_type,
       period,
       strftime(min(pickup_date), '%B %Y') as period_label,
       day_type,
       case day_type when 'weekday' then 'Monday to Friday' else 'Saturday and Sunday' end as day_type_label,
       cast(count(*) as BIGINT) as days,
       cast(sum(crz_trips) as BIGINT) as crz_trips,
       cast(avg(crz_trips) as DECIMAL(18,1)) as crz_trips_per_day
from daily
group by 1, 2, 4, 5
order by day_type, min(pickup_date)
