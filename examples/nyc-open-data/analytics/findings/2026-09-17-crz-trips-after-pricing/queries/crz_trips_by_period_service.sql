-- Secondary, fixed before any number was seen: the same comparison split by service.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
)
select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'baseline' else 'after' end || '_' || service as period_service,
       case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'baseline' else 'after' end as period,
       strftime(min(pickup_date), '%B %Y') as period_label,
       service,
       case service when 'yellow' then 'Yellow taxi' else 'App-based for-hire' end as service_label,
       cast(sum(trips) filter (where in_crz) as BIGINT) as crz_trips,
       cast(sum(trips) as BIGINT) as all_trips,
       cast(sum(trips) filter (where in_crz) / nullif(sum(trips), 0)::DOUBLE as DECIMAL(18,6)) as crz_share
from crz
where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
group by 1, 2, 4, 5
order by service, min(pickup_date)
