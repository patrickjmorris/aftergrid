-- The revision 2 comparison: trips into the zone (crz_trip v1, proposed) on weekdays and, separately, on weekend
-- days, in the baseline month and the after month, with all yellow and high-volume for-hire trips on the same
-- days as the base of the share. A weekday is isodow(pickup_date) <= 5 (weekday_share v1, proposed); public
-- holidays are not separated. pickup_date is already the local New York date; no timezone conversion is applied.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open pickup-date ranges).
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
w as (
  select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'baseline' else 'after' end as period,
         case when isodow(pickup_date) <= 5 then 'weekday' else 'weekend' end as day_type,
         pickup_date, in_crz, trips
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
)
select period || '_' || day_type as period_day_type,
       period,
       strftime(min(pickup_date), '%B %Y') as period_label,
       day_type,
       case day_type when 'weekday' then 'Weekdays' else 'Weekend days' end as day_type_label,
       cast(count(distinct pickup_date) as BIGINT) as days,
       cast(sum(trips) filter (where in_crz) as BIGINT) as crz_trips,
       cast(sum(trips) as BIGINT) as all_trips,
       cast(sum(trips) filter (where in_crz) / nullif(sum(trips), 0)::DOUBLE as DECIMAL(18,6)) as crz_share,
       cast(sum(trips) filter (where in_crz) / count(distinct pickup_date)::DOUBLE as DECIMAL(18,1)) as crz_trips_per_day,
       cast(sum(trips) / count(distinct pickup_date)::DOUBLE as DECIMAL(18,1)) as all_trips_per_day
from w
group by period, day_type
order by day_type, min(pickup_date)
