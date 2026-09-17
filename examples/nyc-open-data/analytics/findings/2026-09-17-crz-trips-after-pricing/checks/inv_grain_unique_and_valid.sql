-- Invariant: inside both windows crz_daily has one row per pickup date x service x in_crz, only the two services
-- the crz_trip definition names, and no null or negative trip count. A duplicate row would double count.
-- Parameters: $base_from, $base_to, $after_from, $after_to.
with crz as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(pickup_date as DATE) as pickup_date, service, cast(in_crz as BOOLEAN) as in_crz, cast(trips as BIGINT) as trips
  from crz_daily
),
w as (
  select * from crz
  where (pickup_date >= $base_from::DATE and pickup_date < $base_to::DATE)
     or (pickup_date >= $after_from::DATE and pickup_date < $after_to::DATE)
),
g as (select pickup_date, service, in_crz, count(*) as n from w group by 1, 2, 3)
select
  (select count(*) from g where n > 1) = 0
  and (select count(*) from w where service not in ('yellow', 'hvfhs')) = 0
  and (select count(*) from w where trips is null or trips < 0 or in_crz is null) = 0 as pass,
  'duplicate grain rows ' || (select count(*) from g where n > 1)
    || '; rows with another service ' || (select count(*) from w where service not in ('yellow', 'hvfhs'))
    || '; rows with null or negative trips or null in_crz ' || (select count(*) from w where trips is null or trips < 0 or in_crz is null) as detail
