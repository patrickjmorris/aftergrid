-- Invariant: the weekday / weekend split the analysis queries use loses nothing and follows weekday_share v1 as
-- written. For each month (1) weekday trips plus weekend trips equal all trips, on the zone side and over both
-- sides, and weekday days plus weekend days equal the days in the month; (2) weekday trips computed the way the
-- analysis computes them (one conditional sum over both services) equal the sum of weekday_trips that the
-- weekday_share v1 SQL returns per service and side of in_crz.
-- weekday_share v1 is PROPOSED, not approved: this shows the analysis follows the definition's text, and is not
-- a reconciliation against an approved definition, because none exists in this Instance.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
def_base as (
  -- weekday_share v1, as written, over the baseline month
  select service, in_crz,
         sum(trips) filter (where isodow(pickup_date) <= 5) as weekday_trips,
         sum(trips) as all_trips,
         count(distinct pickup_date) filter (where isodow(pickup_date) <= 5) as weekday_days,
         count(distinct pickup_date) as days
  from crz
  where service in ('yellow', 'hvfhs')
    and pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE
  group by 1, 2
),
def_after as (
  -- weekday_share v1, as written, over the after month
  select service, in_crz,
         sum(trips) filter (where isodow(pickup_date) <= 5) as weekday_trips,
         sum(trips) as all_trips,
         count(distinct pickup_date) filter (where isodow(pickup_date) <= 5) as weekday_days,
         count(distinct pickup_date) as days
  from crz
  where service in ('yellow', 'hvfhs')
    and pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE
  group by 1, 2
),
direct as (
  -- the analysis rule: a day type per pickup date, summed over both services
  select case when pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE then 'base' else 'after' end as period,
         sum(trips) filter (where in_crz and isodow(pickup_date) <= 5) as crz_weekday,
         sum(trips) filter (where in_crz and isodow(pickup_date) > 5) as crz_weekend,
         sum(trips) filter (where in_crz) as crz_all,
         sum(trips) filter (where isodow(pickup_date) <= 5) as all_weekday,
         sum(trips) filter (where isodow(pickup_date) > 5) as all_weekend,
         sum(trips) as all_all,
         count(distinct pickup_date) filter (where isodow(pickup_date) <= 5) as weekday_days,
         count(distinct pickup_date) filter (where isodow(pickup_date) > 5) as weekend_days,
         count(distinct pickup_date) as days
  from crz
  where service in ('yellow', 'hvfhs')
    and ((pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
      or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE))
  group by 1
),
t as (
  select
    (select count(*) from direct) as periods,
    (select count(*) from direct
      where crz_weekday + crz_weekend <> crz_all or all_weekday + all_weekend <> all_all
         or weekday_days + weekend_days <> days) as partition_faults,
    (select crz_weekday from direct where period = 'base') = (select sum(weekday_trips) from def_base where in_crz)
      and (select all_weekday from direct where period = 'base') = (select sum(weekday_trips) from def_base)
      and (select crz_weekday from direct where period = 'after') = (select sum(weekday_trips) from def_after where in_crz)
      and (select all_weekday from direct where period = 'after') = (select sum(weekday_trips) from def_after) as matches_definition,
    (select max(weekday_days) from def_base) as base_weekday_days,
    (select max(weekday_days) from def_after) as after_weekday_days
)
select
  periods = 2 and partition_faults = 0 and matches_definition as pass,
  'months ' || periods || '; months where weekday plus weekend does not equal the whole ' || partition_faults
    || '; weekday trips match the weekday_share v1 SQL ' || matches_definition
    || '; weekdays per month ' || base_weekday_days || ' and ' || after_weekday_days as detail
from t
