-- Daily series behind the monthly totals, one row per pickup date, for the chart and for inspection.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
)
select pickup_date,
       case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'baseline' else 'after' end as period,
       strftime(pickup_date, '%B %Y') as period_label,
       cast(day(pickup_date) as BIGINT) as day_of_month,
       dayname(pickup_date) as day_name,
       cast(sum(trips) filter (where in_crz) as BIGINT) as crz_trips,
       cast(sum(trips) as BIGINT) as all_trips
from crz
where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
group by 1, 2, 3, 4, 5
order by pickup_date
