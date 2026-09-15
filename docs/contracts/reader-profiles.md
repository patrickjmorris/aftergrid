# Reader profiles

Each Finding names the Reader it is written for. The Reader reviewer in `/analysis-review` adopts that profile; the writer writes against it. Profiles live in the Instance file `analytics/readers.md`; the Engine ships one generic fallback.

## File format

`readers.md` is markdown so an Operator can read and edit it in a PR. Each profile is a level-2 heading whose text is the profile id, followed by one fenced `yaml` block that validates against `schema/reader-profile.schema.json`. Prose outside the block is free notes.

```markdown
# Readers

## product_owner
```yaml
id: product_owner
label: Non-technical product owner
role: Owns the product roadmap; decides what the team builds next quarter.
data_literacy: reads_charts
reads_on: [phone]
time_budget_minutes: 5
decisions:
  - whether to keep, change or stop a feature
  - what to ask the data person next
cares_about:
  - what changed for users, in their words
  - whether the number is big enough to act on
will_misread:
  - treats a correlation as a cause
  - reads a rate without asking what it is a rate of
  - reads a small sample as a trend
vocabulary:
  use: [listeners, episodes, plays]
  avoid: [denominator, cohort, p-value]
```
Notes in prose here.
```

`check` fails a Finding whose `reader.profile` names a profile id not present in `readers.md`, unless it is `generic`.

## Generic fallback

`schema/generic-reader-profile.yaml` is used when a Finding names `generic` or an Instance has no readers file. It assumes a phone reader with no data training and five minutes. Nothing in it is company-specific.

## How the profile is used

- Writer: sentence length, vocabulary, what sits above the fold, which Claim gets the chart.
- Reader reviewer: adopts `role`, `data_literacy` and `will_misread`; reports where the memo invites each listed misreading.
- Render: `reads_on` does not change the HTML (every render supports phone and keyboard); it sets which viewport the visual iteration screenshots at.
- Human session: the real Reader for the exemplar and pilot gates should match the profile; their observed misreadings feed back into `will_misread`. Private feedback stays in the Instance; only sanitized contract lessons reach the Engine.
