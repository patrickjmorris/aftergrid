---
id: habit_creation_rate
version: 2
kind: metric
lifecycle: approved
grain: user
population: users who completed signup
denominator: all users in the signup cohort
window: first_habit_created within two calendar days of signup, in America/New_York
owner: Dana Okafor
counter_metrics:
  - id: retained_7d
    version: 2
    why: A forced habit step in onboarding lifts this rate with habits nobody comes back for, so the share of the cohort still opening the app in the week after signup is what would fall.
approval:
  source:
    type: github_pr_review
    repository: loop-example/analytics
    pull_request: 27
    review_id: 3100027
    commit_sha: c4e6a8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2
  approver: dana-okafor
  date: 2026-09-17
  content_hash:
    algorithm: sha256
    value: "2c17a32e413d8289315cd70f2b715a14f6d398135c2335b37f7eb9d219670e0e"
---
The **habit creation rate** is the share of a signup cohort that recorded at least one `first_habit_created` event within two calendar days of signing up. It measures whether onboarding got the user to the first real action.

Version 2 adds nothing to the calculation. It names the counter-metric: what pushing this rate hard would damage. That sentence is part of what the metric means, so it changed the definition's content hash and needed an approval of its own (`docs/contracts/instance-layout.md`, "Counter-metrics"). A Finding that publishes `habit_creation_rate` as its decision metric must report `retained_7d` beside it, over the same population and window, or say why it could not.

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
