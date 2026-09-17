# Readers

Named Reader profiles for this Instance. Format: `docs/contracts/reader-profiles.md`; schema:
`schema/reader-profile.schema.json`.

Every Finding names the Reader it is written for. A Finding that names no profile uses the built-in **generic**
profile — a non-data decision maker, with nothing else known about them.

**Both profiles below are composites, not people.** This is a public demo Instance built on public data; nobody
real is described here, and neither profile has sat for a Reader session yet. They are written from the roles the
two demo Questions are aimed at, and the `will_misread` lists are the misreadings the data itself invites — a
zone-boundary policy read as a citywide effect, a share read without its denominator, a weather difference read
as a behaviour change. When a real Reader does read a Finding here, what they actually misread belongs in these
lists, replacing whatever was guessed.

## city_transport_analyst
```yaml
id: city_transport_analyst
label: Non-data transport programme lead
role: Leads evaluation of a city transport programme; decides what to report upward about how congestion pricing is going and what to look at next. Does not write SQL and does not open a notebook.
data_literacy: reads_charts
reads_on: [laptop, phone]
time_budget_minutes: 10
decisions:
  - what to report upward about how the charge is going, and how firmly to say it
  - whether a change is large enough to look into properly rather than note
  - whether to wait for a longer post-change window before drawing any conclusion
  - what to ask the data team for next
cares_about:
  - how many trips went into the zone after the charge started, compared with the same month a year earlier
  - whether that is out of more trips or fewer trips overall, and not just a raw count
  - whether the two periods were alike enough to compare at all, weather included
  - what would have to be true for the answer to be wrong
will_misread:
  - reads a before-and-after difference as the effect the charge caused
  - reads a fall in trips into the zone as a fall in trips across the city
  - reads a count without asking what share of all trips it is
  - treats "the weather check passed" as meaning the comparison is now safe to call causal
  - reads a single month either side as a trend
vocabulary:
  use: [trips into the zone, the same month last year, out of all trips, before the charge, after the charge, weekday, weekend]
  avoid: [denominator, difference-in-differences, counterfactual, statistically significant, p-value, confounder]
notes: >-
  Composite, not a person. The trip records carry no rider identity, so nothing written for this Reader can say
  whether the same people changed behaviour — only whether the trips changed. Say that in the memo rather than
  leaving it to be inferred.
```

## bike_product_manager
```yaml
id: bike_product_manager
label: Bike share product manager
role: Owns a bike share product area; decides what to build, price and promote next quarter. Reads numbers daily in dashboards but does not write queries and has never checked one.
data_literacy: reads_tables
reads_on: [laptop]
time_budget_minutes: 10
decisions:
  - whether the mix between members and casual riders is moving enough to act on
  - whether e-bike use among members is growing, flat, or moving with something else
  - whether a pricing or fee change is worth investigating properly
  - what to put in front of the team as a question rather than an answer
cares_about:
  - how much of member riding is on e-bikes, and how that compares with the same month a year earlier
  - whether a change in share is riders switching or just a different number of rides overall
  - what happened at the same time that could explain it, including fee changes and weather
  - which of these numbers is solid enough to repeat in a meeting
will_misread:
  - reads a rising share as rising demand when the total fell
  - assumes a change that lines up in time with a fee change was caused by it
  - reads system-wide ride counts as counts of distinct riders
  - compares a winter month with a summer month without saying so
vocabulary:
  use: [rides, members, casual riders, e-bikes, classic bikes, share of rides, the same month last year]
  avoid: [denominator, cohort, mix shift, elasticity, uplift, statistically significant]
notes: >-
  Composite, not a person. The Citi Bike files are ride records, not rider records: there is no repeat-rider
  link, so "members" here means rides taken under a membership, never a count of people. A Finding for this
  Reader has to say that in the first place the word appears.
```
