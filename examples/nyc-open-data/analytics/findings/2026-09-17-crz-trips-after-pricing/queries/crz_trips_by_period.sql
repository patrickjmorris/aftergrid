-- The pre-registered comparison: trips into the zone (crz_trip v1, proposed) for the baseline month and the
-- after month, with all trips in the same table as the base of the share, and the weekday_share v1 diagnostic
-- (proposed) computed from crz_daily, which carries every trip trips_daily carries.
-- pickup_date is already the local New York date; no timezone conversion is applied.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open pickup-date ranges).
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
)
select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'baseline' else 'after' end as period,
       strftime(min(pickup_date), '%B %Y') as period_label,
       min(pickup_date) as first_day,
       max(pickup_date) as last_day,
       cast(count(distinct pickup_date) as BIGINT) as days,
       cast(sum(trips) filter (where in_crz) as BIGINT) as crz_trips,
       cast(sum(trips) as BIGINT) as all_trips,
       cast(sum(trips) filter (where not in_crz) as BIGINT) as other_trips,
       cast(sum(trips) filter (where in_crz) / nullif(sum(trips), 0)::DOUBLE as DECIMAL(18,6)) as crz_share,
       cast(sum(trips) filter (where in_crz) / count(distinct pickup_date)::DOUBLE as DECIMAL(18,1)) as crz_trips_per_day,
       cast(count(distinct pickup_date) filter (where isodow(pickup_date) <= 5) as BIGINT) as weekday_days,
       cast(sum(trips) filter (where isodow(pickup_date) <= 5) / nullif(sum(trips), 0)::DOUBLE as DECIMAL(18,6)) as weekday_share_all_trips
from crz
where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
group by 1
order by first_day
