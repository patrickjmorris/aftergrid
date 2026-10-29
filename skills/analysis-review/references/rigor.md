# Rigor rules

The rules a number has to pass before anyone trusts it. Each aftergrid skill that handles numbers ships an identical copy of this page. The skill's own steps say when to apply which section. The rules hold in portable work and in Engine mode. The Engine adds narrower contracts on top of them, never looser ones.

## Rates and denominators

- A pooled rate is `sum(numerator) / sum(denominator)`. It is not the unweighted mean of segment rates, unless that mean is the stated estimand. The same holds for any ratio of totals: do not substitute a mean of row-level ratios.
- Inspect the numerator and the denominator separately. A rate moves when either one moves.
- Report every rate with its denominator, units, and population beside it. A rate with no denominator in sight invites the wrong reading.
- Check denominator eligibility. Every member of the numerator must belong to the eligible denominator.
- A zero denominator is not zero performance. Report it as not available. Never write 0, a blank, or a dash.

## Changes and comparisons

- Report a change in a rate as an absolute percentage-point change. Add the relative change when it helps, and name its baseline.
- Never silently swap percentage points for percent. Say which one a number is.
- Name the before and after operands of every difference, ratio, or percent change, so the sign cannot flip unnoticed.
- Keep the baseline and the time window with any comparison someone might quote out of context.

## Aggregates and mix

- When an aggregate moves, separate change within comparable segments from change in the segments' weights. A rate can fall overall while every segment improves.
- Inspect segment weights whenever the aggregate moves differently from its components.
- A decomposition says where the arithmetic movement came from. It does not say why behavior changed.

## Grain and joins

- Establish what one row means before aggregating. A user row, an event row, and an invoice line are different units, even when each carries a user ID. A column named `user_id` does not make a table one row per user.
- Test key uniqueness at the grain the analysis needs.
- State each join's cardinality at that grain: one-to-one, one-to-many, or many-to-many. Compare row counts and distinct keys before and after the join. Count unmatched keys on both sides.
- Aggregate each side to the intended grain before joining when needed. When several records exist per key, establish which record is valid as of the event.
- Do not use DISTINCT to hide an unexplained multiplication.
- Keep unmatched rows visible and explain every exclusion. An inner join can drop inactive users, unpaid invoices, or unmatched history. Name what it drops. A join that matches well overall can still fail for one period or segment.

## Time, coverage, and missing values

- Separate event time from processing or ingestion time. State the timezone and the reporting-date convention.
- Check coverage by source and by period, not only the overall first and last dates.
- Before reading a change as behavior, check for incomplete periods, late arrivals, an immature recent cohort, duplicated records, and instrumentation, schema, or definition changes.
- Missing rows, measured zeros, and not-applicable cells are three different values. Never collapse them into one. A missing date can mean zero activity, absent collection, or a date the source does not cover. Find out which.

## Claims and causation

- Use descriptive language for observed values and associational language for relationships. Use causal language only when the design earns it.
- A causal claim needs a design that supports it. That means randomized assignment, or an identification strategy whose assumptions you name and the data can test. Association alone is not enough. A before-and-after observation cannot establish what caused the change. Engine Findings are narrower still: only randomized assignment earns a causal Claim there.
- Watch the verbs. "Caused," "drove," "led to," "because," and "thanks to" assert a cause.
- Separate the direction of a change from whether its cause is known.
- An exploratory correlation is a lead to test, not a finding.
- Do not upgrade an association into a cause or a forecast to make a conclusion or an option look stronger.

## Planned and exploratory work

- Write the primary comparison, and what would undermine it, before making explanatory cuts.
- Separate a data-validity check from a substantive test. Duplicate events can invalidate a count. A pre-specified contrast that does not support the hypothesis is evidence against it, not a broken pipeline.
- Label every hypothesis, cut, or subgroup chosen after seeing results as exploratory. Post-hoc subgroup discovery is not confirmation. Exploratory work never becomes pre-registration after the fact.
- Derive thresholds from supplied policy or analytical requirements, never from convenient observed values. Do not move a threshold after seeing its result and call it pre-registered.
- Never invent a universal sample-size cutoff. An unknown policy stays unknown.

## Executed and proposed

- Record the actual query or transformation, its parameters, and its observed result. Record the source version or retrieval time when available.
- Keep a short log as the work happens, not afterward: what each step tested, what it showed, what it decided, and whether it was planned or exploratory.
- Label every check or query that did not run as unexecuted. Never fill a saved result with expected values.
- In what you deliver, distinguish checks executed from checks proposed, and observed facts from explanations.
- Say whether another person can rerun the calculation, only inspect saved results, or neither.
- Do not invent approvals, confidence intervals, or causal identification.
