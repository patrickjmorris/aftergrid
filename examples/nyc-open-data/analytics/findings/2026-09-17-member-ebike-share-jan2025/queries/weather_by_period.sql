-- Weather in each month, in the units weather_daily carries: degrees Celsius and millimetres. Snow is reported
-- here although comparable_weather_day v1 does not test it, because a snowy month changes cycling more than a
-- rainy one and the Reader should see what the rule left out.
-- Parameters: $base_from, $base_to, $after_from, $after_to (half-open ride-date ranges).
with w as (
  -- retained extracts load every column as text, so each column is cast once, here
  select cast(observation_date as DATE) as observation_date,
         cast(tmax_c as DOUBLE) as tmax_c,
         cast(tmin_c as DOUBLE) as tmin_c,
         cast(prcp_mm as DOUBLE) as prcp_mm,
         cast(snow_mm as DOUBLE) as snow_mm
  from weather_daily
)
select case when observation_date >= $base_from::DATE and observation_date < $base_to::DATE then 'baseline' else 'after' end as period,
       strftime(min(observation_date), '%B %Y') as period_label,
       cast(count(distinct observation_date) as BIGINT) as days_observed,
       cast(avg(tmax_c) as DECIMAL(18,2)) as mean_tmax_c,
       cast(count(*) filter (where tmax_c <= 0) as BIGINT) as freezing_days,
       cast(count(*) filter (where prcp_mm >= 1) as BIGINT) as wet_days,
       cast(count(*) filter (where snow_mm > 0) as BIGINT) as snow_days,
       cast(sum(prcp_mm) as DECIMAL(18,2)) as total_prcp_mm,
       cast(sum(snow_mm) as DECIMAL(18,2)) as total_snow_mm
from w
where (observation_date >= $base_from::DATE and observation_date < $base_to::DATE)
   or (observation_date >= $after_from::DATE and observation_date < $after_to::DATE)
group by 1
order by min(observation_date)
