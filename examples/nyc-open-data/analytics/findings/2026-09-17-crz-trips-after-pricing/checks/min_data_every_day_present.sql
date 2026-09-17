-- Minimum data: both months are whole. Every calendar day of each window is present for both services, on both
-- sides of the zone flag, and every day has at least one trip into the zone. A missing day would make a
-- month-against-month count meaningless.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
w as (
  select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'base' else 'after' end as period,
         pickup_date, service, in_crz, trips
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
),
per_day as (
  select period, pickup_date, count(*) as cells, sum(trips) filter (where in_crz) as crz_trips
  from w group by 1, 2
),
s as (
  select
    count(*) filter (where period = 'base') as base_days,
    count(*) filter (where period = 'after') as after_days,
    count(*) filter (where cells <> 4 or crz_trips is null or crz_trips = 0) as thin_days
  from per_day
)
select
  base_days = date_diff('day', $base_from::DATE, $base_to::DATE)
  and after_days = date_diff('day', $after_from::DATE, $after_to::DATE)
  and thin_days = 0 as pass,
  'baseline days present ' || base_days || ' of ' || date_diff('day', $base_from::DATE, $base_to::DATE)
    || '; after days present ' || after_days || ' of ' || date_diff('day', $after_from::DATE, $after_to::DATE)
    || '; days missing a service, a zone side or any zone trip ' || thin_days as detail
from s
