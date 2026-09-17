-- Secondary, fixed at the revision 2 clarify stage: the day-type comparison split by service. 'All trips' here is
-- all trips of that service on those days. Revision 1 had already shown the monthly direction for each service,
-- so this split is a follow-up look and not a comparison planned before the data was seen.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open pickup-date ranges).
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
w as (
  select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'baseline' else 'after' end as period,
         case when isodow(pickup_date) <= 5 then 'weekday' else 'weekend' end as day_type,
         service, pickup_date, in_crz, trips
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
)
select period || '_' || day_type || '_' || service as period_day_type_service,
       period,
       strftime(min(pickup_date), '%B %Y') as period_label,
       day_type,
       case day_type when 'weekday' then 'Weekdays' else 'Weekend days' end as day_type_label,
       service,
       case service when 'yellow' then 'Yellow taxi' else 'App-based for-hire' end as service_label,
       cast(count(distinct pickup_date) as BIGINT) as days,
       cast(sum(trips) filter (where in_crz) as BIGINT) as crz_trips,
       cast(sum(trips) as BIGINT) as all_trips,
       cast(sum(trips) filter (where in_crz) / nullif(sum(trips), 0)::DOUBLE as DECIMAL(18,6)) as crz_share,
       cast(sum(trips) filter (where in_crz) / count(distinct pickup_date)::DOUBLE as DECIMAL(18,1)) as crz_trips_per_day
from w
group by period, day_type, service
order by day_type, service, min(pickup_date)
