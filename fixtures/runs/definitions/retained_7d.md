---
id: retained_7d
version: 2
kind: metric
lifecycle: approved
grain: user
population: users who completed signup
denominator: all users in the signup cohort
window: calendar days 1 through 7 after the signup day, in America/New_York
owner: Dana Okafor
approval:
  source:
    type: github_pr_review
    repository: loop-example/analytics
    pull_request: 12
    review_id: 3100012
    commit_sha: 3f2a9c1e5d7b4a6f8c0e2d4b6a8c0e2f4a6b8c0d
  approver: dana-okafor
  date: 2026-05-28
  content_hash:
    algorithm: sha256
    value: "a496990d0aa0bc832758710d1c778d4de4add966e70fe0b7e891a55df3fc08f8"
---
A user is **retained at 7 days** when they opened the app on at least one of the seven calendar days after the day they signed up. The day of signup does not count. Days are calendar days in New York time, so a user who signs up at 11pm and opens the app at 1am the next morning counts as retained.

The rate is retained users divided by all users who signed up in the period, including users who never opened the app again.

## SQL (duckdb)
```sql
-- Parameters: $tz (analytical timezone). Tables: users, events.
with cohort as (
  select user_id, cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day
  from users
),
opens as (
  select user_id, cast(timezone($tz, "timestamp"::timestamptz) as date) as open_day
  from events where event = 'app_open'
)
select c.user_id,
       exists (select 1 from opens o where o.user_id = c.user_id
               and o.open_day between c.signup_day + 1 and c.signup_day + 7) as retained_7d
from cohort c
```

## SQL (postgres)
```sql
-- Parameters: $1 = analytical timezone. Tables: users, events.
with cohort as (
  select user_id, (signed_up_at at time zone $1)::date as signup_day from users
),
opens as (
  select user_id, ("timestamp" at time zone $1)::date as open_day from events where event = 'app_open'
)
select c.user_id,
       exists (select 1 from opens o where o.user_id = c.user_id
               and o.open_day between c.signup_day + 1 and c.signup_day + 7) as retained_7d
from cohort c
```
