-- Invariant: the monthly totals of trips into the zone, computed the way the analysis queries compute them
-- (one conditional sum per month), equal the sum of the daily rows that the crz_trip v1 SQL returns as written.
-- crz_trip v1 is PROPOSED, not approved: this shows the analysis follows the definition's text, and is not a
-- reconciliation against an approved definition, because none exists in this Instance.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
def_base as (
  select pickup_date, service, sum(trips) as crz_trips
  from crz
  where in_crz and service in ('yellow', 'hvfhs')
    and pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE
  group by 1, 2
),
def_after as (
  select pickup_date, service, sum(trips) as crz_trips
  from crz
  where in_crz and service in ('yellow', 'hvfhs')
    and pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE
  group by 1, 2
),
direct as (
  select
    sum(trips) filter (where in_crz and pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE) as base_total,
    sum(trips) filter (where in_crz and pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE) as after_total
  from crz
  where service in ('yellow', 'hvfhs')
)
select
  (select sum(crz_trips) from def_base) = (select base_total from direct)
  and (select sum(crz_trips) from def_after) = (select after_total from direct) as pass,
  'definition SQL rows: ' || (select count(*) from def_base) || ' baseline, ' || (select count(*) from def_after)
    || ' after; totals match the direct sums: '
    || ((select sum(crz_trips) from def_base) = (select base_total from direct)) || ' and '
    || ((select sum(crz_trips) from def_after) = (select after_total from direct)) as detail
