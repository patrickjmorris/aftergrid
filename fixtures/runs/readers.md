# Readers

Named Reader profiles for the Loop Instance. Format: `docs/contracts/reader-profiles.md`; schema: `schema/reader-profile.schema.json`.

## product_owner
```yaml
id: product_owner
label: Non-technical product owner
role: Owns the Loop product roadmap and decides what the team builds next; reads Findings between meetings.
data_literacy: reads_charts
reads_on: [phone]
time_budget_minutes: 5
decisions:
  - whether to keep, change or stop a feature
  - whether to wait for more data before deciding
  - what to ask the data person next
cares_about:
  - what changed for users, in plain words
  - whether the number is big enough to act on
  - what would make this answer wrong
will_misread:
  - treats a correlation as a cause
  - reads a rate without asking what it is a rate of
  - reads a small or immature sample as a trend
  - assumes a passed Check means the conclusion is right
vocabulary:
  use: [people, new users, came back, out of, compared with]
  avoid: [denominator, cohort, statistically significant, p-value, lift]
```
