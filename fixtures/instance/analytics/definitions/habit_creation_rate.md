---
id: habit_creation_rate
version: 1
kind: metric
lifecycle: approved
grain: user
population: users who completed signup
denominator: all users in the signup cohort
window: first_habit_created within two calendar days of signup, in America/New_York
owner: Dana Okafor
approval:
  source:
    type: github_pr_review
    repository: loop-example/analytics
    pull_request: 19
    review_id: 3100019
    commit_sha: 8b1c3d5e7f9a1b3c5d7e9f1a3b5c7d9e1f3a5b7c
  approver: dana-okafor
  date: 2026-07-30
  content_hash:
    algorithm: sha256
    value: "bacf77e3b6484d450811def2520e05961b9efa86269bb989232be1e572592cea"
---
The **habit creation rate** is the share of a signup cohort that recorded at least one `first_habit_created` event within two calendar days of signing up. It measures whether onboarding got the user to the first real action.

This is a synthetic fixture definition; its approval block is fictional example data for the schema shape (see `fixtures/README.md`).

## SQL (duckdb)
```sql
-- Parameters: $tz. Tables: users, events.
with cohort as (
  select user_id, cast(timezone($tz, signed_up_at::timestamptz) as date) as signup_day from users
),
first_habit as (
  select user_id, min(cast(timezone($tz, "timestamp"::timestamptz) as date)) as habit_day
  from events where event = 'first_habit_created' group by user_id
)
select c.user_id, h.habit_day is not null and h.habit_day <= c.signup_day + 2 as created_habit
from cohort c left join first_habit h using (user_id)
```

## SQL (postgres)
```sql
-- Parameters: $1 = analytical timezone. Tables: users, events.
with cohort as (
  select user_id, (signed_up_at at time zone $1)::date as signup_day from users
),
first_habit as (
  select user_id, min(("timestamp" at time zone $1)::date) as habit_day
  from events where event = 'first_habit_created' group by user_id
)
select c.user_id, h.habit_day is not null and h.habit_day <= c.signup_day + 2 as created_habit
from cohort c left join first_habit h using (user_id)
```
