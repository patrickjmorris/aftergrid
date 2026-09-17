---
name: write-finding
description: Turn a checked Analysis directory into a Finding a Reader can read and inspect - memo.md in the fixed sections, typed Claims, charts and tables, every displayed value bound to a saved result. Use once /checked-analysis has pinned results and written analysis.yaml, and before /iterate-visual, /shape-narrative and /analysis-review.
user-invocable: false
version: 0.1.0
---

# Write the Finding

`/checked-analysis` leaves a directory where the numbers are settled and nothing has been said yet. You turn
it into a Finding: `memo.md` in six fixed sections, typed Claims in `manifest.yaml`, and a chart or a table
behind every number a Reader is asked to believe.

**Your half of the directory.** You write `memo.md` and exactly these manifest fields: `claims`, `charts`,
`tables`, `derived`, `external_sources`, `coverage`, `export_policy.allowed_fields`, `reader.profile`,
`finding.title`, `finding.state`, `finding.outcome`, `finding.generated_at`, `content_digest`.

Everything else is already evidence and you read it: `question`, `snapshot`, `definitions`, `queries`,
`executions`, `results`, `checks`, `owner`, `renderer`, and `analysis.yaml`. `reviews` and `attestations`
belong to a reviewer and to a human approver; you leave them exactly as you found them.

A number that is not in `results/` does not exist. A conclusion the Analysis did not reach is not yours to
reach.

## 1. Read the directory

Read `manifest.yaml`, `analysis.yaml`, every file under `results/`, and the Reader profile that
`analysis.yaml#reader_profile` names — `<instance>/readers.md`, or `schema/generic-reader-profile.yaml` when
it is `generic`.

`analysis.yaml` is the Analysis directory's own record, written by `/checked-analysis`
(`docs/contracts/analysis-directory.md`, schema `src/analysis/analysis.schema.json`). You read five parts of
it: `analysis.yaml#reader_profile`, `analysis.yaml#outcome_recommendation`, `analysis.yaml#needs_input`,
`analysis.yaml#candidate_claims` and `analysis.yaml#assumptions`. The rest — probes, the pre-registered
comparison, the execution order — is context for the prose and for the reviewer, never something to restate
as a Claim.

Read the file you were given, not the file you expected. Every field named on this page is a field the
Analysis schema defines; where a step needs something the Analysis did not record, the step says so and
names `needs_input` rather than letting you supply it.

**Done when** you can state, without looking again: the decision the Question informs, the outcome
`analysis.yaml#outcome_recommendation.outcome` names, every `results[].id` with its row keys and columns, and
each item on the Reader profile's `will_misread` list.

## 2. Take the outcome as given

`finding.outcome` is `analysis.yaml#outcome_recommendation.outcome`, carried across unchanged.

When `analysis.yaml#needs_input` is non-empty, stop here: set `finding.state: needs_input`, copy each item
into `finding.needs_input` with its owner, leave the outcome `pending`, and report what is missing and who
owns it. Writing around a missing definition approval or an unanswered clarification is the failure this
step exists to catch.

For `insufficient_data`, `needs_reframing` or `inconclusive`, read
[`references/outcomes.md`](references/outcomes.md) before writing any prose.

**Done when** `finding.outcome` equals the recommendation and, on a non-answer, you can say in one sentence
what would have to be true for an answer to exist.

## 3. Type every Claim

Every candidate Claim in `analysis.yaml` becomes a manifest Claim carrying a `type`: `descriptive`,
`associational` or `causal`. The type is earned by how the comparison was built, never by how large the
number is. Read [`references/claim-typing.md`](references/claim-typing.md).

**Done when** each Claim has a `type`, you can name the fact in `analysis.yaml` that earns it, and every
Claim typed below `causal` has a sentence whose verbs describe rather than explain.

## 4. Bind every value

Every number a Reader sees is a token resolving to a saved cell, a declared derived value or a typed
external source. Read [`references/evidence-binding.md`](references/evidence-binding.md), then declare, in
this order:

1. `external_sources` — every typed target or assumption a candidate Claim, a `material_caveat` or a
   `recheck_draft` names as `ext:<id>`, each with its `kind`, `unit`, `display` and where it came from. The
   Analysis records them in `analysis.yaml#assumptions`: the entry whose `statement` names that `ext:<id>`
   carries its value, its unit and its source, and `basis` plus `settled_by` say where the value was
   settled. Where the Analysis schema carries the typed list, `analysis.yaml#requested_external_sources`
   says the same thing in fields.
   **A value the Analysis did not record does not exist.** A threshold, a target, a policy minimum or a
   date you would have to choose is a `needs_input` item with the owner `settled_by` names — go back to
   step 2 and stop there. Inventing one to fill `external_sources` is the failure this ordering exists to
   catch.
2. `derived` — the display-time arithmetic a Claim, a caveat or a recheck names as `derived:<id>`. The
   Analysis records each one in `analysis.yaml#notes`, one line per value with its operation and its
   operands; where the schema carries the typed list, `analysis.yaml#requested_derived` says the same thing
   in fields. Prefer a value the SQL already produced; a `derived` entry exists for display-time arithmetic
   the query did not do.
   **A `difference`, `ratio` or `percent_change` names its operands** — `operands: { after: <ref>, baseline:
   <ref> }`, never a positional pair. A run wrote four percent changes baseline-then-after and every rendered
   change carried the opposite sign ("rose by −20.6%"); `check` could not see it, because both orders are
   valid arithmetic, and only the method reviewer caught it. `after` is the measured value, `baseline` is what
   it is compared with, and naming them makes the sign a declared fact the Engine verifies. A positional pair
   on one of those three is the warning `direction_unstated`; named operands on `sum`, `min`, `max` or
   `percent_of` are refused, because those operations have no direction to declare.
3. Each Claim's `evidence` array, listing every value the Claim rests on.

**Done when** every derived value and external source the Analysis recorded is declared with a unit and a
display rule, every `difference`, `ratio` and `percent_change` names its `after` and `baseline` operands, every reference in every `evidence` array resolves to a declared result cell, derived value or
external source, and no declared value carries a number the Analysis did not record.

## 5. Write the Claims

Each Claim carries, in the Reader's words: `sentence`, `population` (who is counted), `comparison` (against
what, plus `pre_registered`), `window`, `exclusions`, `limitations`, and the `recheck` policy drafted in
`analysis.yaml`.

- `numeric: true` for a Claim that asserts a number. It then needs at least one evidence reference and at
  least one chart or table.
- `numeric: false` is how a Claim states a method choice or a gap with no number behind it; its `evidence`
  may be empty.
- Exactly one Claim is `answer_bearing: true`, and it carries a `material_caveat`: the one caveat that would
  change the conclusion, written so a Reader who reads only the Answer still meets it.

`comparison.kind` is the Analysis's fact and never your judgement. Since 2026-09-16 the Analysis schema uses the
manifest's spelling, so the value is carried across unchanged; the table is the identity and exists so a checker
can prove nothing is renamed:

| `analysis.yaml#candidate_claims[].comparison.kind` | `manifest.yaml` `claims[].comparison.kind` |
| --- | --- |
| `none` | `none` |
| `baseline_period` | `baseline_period` |
| `cohort_vs_cohort` | `cohort_vs_cohort` |
| `variant_vs_control` | `variant_vs_control` |
| `target` | `target` |

A value outside the left column is an error in the Analysis: report it with its location and stop, rather
than picking the nearest manifest value. `description` and `pre_registered` are carried across verbatim.

**Done when** every candidate Claim from `analysis.yaml` is present, no Claim field uses a word on the
Reader profile's `vocabulary.avoid` list, and the `material_caveat` answers at least one item on that
profile's `will_misread` list.

## 6. Give every numeric Claim a chart or a table

A table is enough, and on a phone it is often better. Reach for a chart when the shape of the comparison is
the point.

- One Vega-Lite spec per chart at `charts[].spec_path`: `$schema` pinned to
  `https://vega.github.io/schema/vega-lite/v5.json`, `"data": {"name": "result"}` and nothing else under
  `data`, encodings naming declared columns of the chart's `result_id`. The renderer binds the rows.
  Arithmetic lives in SQL or in a `derived` entry, so a spec that computes — `transform`, `aggregate`,
  `bin`, `timeUnit`, a normalised `stack`, inline data, a URL — is refused by `check` with category
  `chart_subset`. The subset and the house style are `docs/contracts/render.md`.
- `charts[].title` states the Claim with its values bound, not the axis. `charts[].description` is what a
  Reader who cannot see the chart is told.
- `tables[]` name their `result_id`, their columns with Reader-facing labels, and the `row_keys` to show.
  `tables[].title` states the Claim the table evidences, in the Reader's words, and carries **no token**: a
  table caption is rendered verbatim, so `{{ref:…}}` in a title reaches the Reader as literal braces. The
  values are in the rows underneath it.

**Done when** every `numeric: true` Claim lists a chart or table id owned by that Claim, every field a chart
or table shows is in `export_policy.allowed_fields`, and every chart and table title reads as a sentence a
Reader could repeat out loud rather than a name for the artifact ("New users who saw the checklist came back
more often", not "Retention by arm" or "Who was counted").

## 7. Declare what may reach the Reader

- `export_policy.allowed_fields` lists every `<result_id>.<column>` a Reader may see — in prose, in a table
  cell, inside chart data, as a derived operand. List the columns your Claims, charts and tables use.
  `allowed_fields` is the only key in that block you write. `recipient_scope`, `granularity`, `delivery` and
  `private_marker` are the Instance's, already set, and you leave them byte-identical — `private_marker`
  above all, because both the memo scan in `check` and the output-byte refusal in `render` only run when it
  is present, so dropping it disables the Instance's private-content sentinel without failing anything.
- `coverage` says in plain words what data this Finding covers and what it leaves out. Its two dates come from
  what was actually run — never from the Question's window, never from today, and never from a date that reads
  right.
  - **On the recorded path** — the default (ADR 0010): the harness ran the queries, `aftergrid record` wrote
    them down, `executions[].mode` is `recorded` and `snapshot.inputs` is empty. Take the window from the
    **recorded parameters** of the executions the Claims rest on: `data_from` is the parameter that opens it,
    `data_to` the parameter that closes it — or, where the SQL reads up to the moment it ran, the recorded
    execution's `executed_at`. Say in `coverage.description` that nothing was retained, so the saved results
    replay exactly as they were recorded and cannot be recomputed here.
  - **On the adapter path** — `aftergrid capture` retained the inputs and `aftergrid execute` ran against them.
    Take `data_from` and `data_to` from the retained inputs, which may run wider or narrower than the
    Question's window.
  - A date that is in neither the parameters nor the retained inputs is a `needs_input` item with its owner —
    go back to step 2. Inventing one is the failure this ordering exists to catch.
- `reader.profile` is the profile `analysis.yaml` names. When it is `generic`, say so in **How we checked**:
  a Reader is owed the knowledge that the memo was written for nobody in particular.

**Done when** every token and every displayed column resolves to a listed field, and `coverage` names both
what is in and what is out.

## 8. Write memo.md

Six sections, in this order, and no others: **Answer**, **Decision it informs**, **Evidence**, **How we
checked**, **What would change our mind**, **Appendix**. The markers and the rules `check` enforces are
`docs/contracts/memo-template.md`. Ordering and Reader-level language are `/shape-narrative`'s craft; write
answer-first here and let that skill sharpen it.

- Front matter `finding` and `revision` match the manifest.
- **Answer** — one sentence. Then `<!-- material_caveat -->` and the answer-bearing Claim's
  `material_caveat`, copied exactly.
- **Decision it informs** — the decision, who owns it, what the options are.
- **Evidence** — one `### ` subsection per Claim. The heading is the Claim's `sentence` verbatim, tokens
  included, followed by `<!-- claim: <id> -->`. A numeric Claim's subsection opens with its
  `<!-- chart: <id> -->` or `<!-- table: <id> -->` marker, then the prose: who is counted, compared with
  what, over which period, what was left out, what the limits are.
- **How we checked** — the Checks by name and outcome, the definitions with their lifecycle, the Snapshot
  guarantees, the Reader profile, and that no review or approval is recorded yet. Separate facts, never one
  badge.
- **What would change our mind** — the Question's falsifier in plain words, then each Claim's Recheck policy
  in plain words, then the earliest date a re-check means anything. Where `question.falsifier.kind` is
  `not_evaluable`, say that none can be written yet and name who owns that. Where the falsifier **already
  fired** — its recorded outcome is not its `expected_outcome` — say so here and say what would settle the
  Question instead; the outcome is then `inconclusive` or `needs_reframing`, and `references/outcomes.md` has
  the shape that memo takes.
- **Appendix** — query ids and paths, result ids, the parameters, and **what was run and by which tool**. On
  the recorded path that is the tool `executions[].executed_by.tool` names, and the Appendix says plainly that
  no copy of the data was kept: what was run is in the manifest — the query text, the parameters, the tool, and
  the hash of everything it produced, including each agent-reported Check's evidence file. On the adapter path
  it is the retained inputs, listed.

**Done when** the sections and markers are exactly as above and every numeral in the file sits inside a
token or on the allowed list in `docs/contracts/reference-grammar.md`.

## 9. Close the Finding

Set `finding.title` (a sentence a Reader can scan, not a restatement of the Answer), `finding.state:
complete`, `finding.generated_at`, then re-pin `content_digest` with `digestOf` from
`scripts/lib/validate-finding.mjs`. The digest covers the memo, the queries, the Checks, the chart specs and
the results, so re-pin after every later edit too.

## 10. Check, render, fix

```bash
aftergrid check <finding-dir>       # from a checkout: node src/cli.ts check <finding-dir>
aftergrid render <finding-dir>
```

Fix what you introduced: an unresolved token, an untraced numeral, a missing section or marker, a chart
outside the subset, a column outside `allowed_fields`, a heading that no longer matches its Claim sentence,
a stale digest.

A failure that is not yours belongs to whoever owns it. A failing required Check, a `hash_mismatch` on a
recorded result, on a Check's evidence file or on a retained input, a rerun mismatch, or a decision metric
whose definition is not approved is the Analysis or the Instance: report the category and location and stop.
Reopening the Analysis is `/analyze`'s call. A `rerun_unavailable` on the recorded path is not a failure at
all — it is what that route guarantees, and the memo says so rather than treating it as something to fix.

**Three passes is the maximum.** When `check` still reports an error you introduced after a third pass,
stop and hand back a `needs_attention` result naming the error category, its location and what you tried. A
fourth pass is guessing.

**Done when** `check` reports `evidence valid` with zero errors and `render` writes `render/finding.html`
with no warning — or a `needs_attention` result names exactly what is unresolved.

## Boundaries

Each of these is a hard rule, stated as what to do and then as the line not to cross.

| Do | Never |
| --- | --- |
| Report a wrong or missing number and stop. | Edit `queries/`, `checks/`, `results/`, `inputs/`, `executions`, `definitions`, `snapshot` or `analysis.yaml`. |
| Leave `reviews` and `attestations` as you found them. | Add an entry to either. `check` reports an approval nobody granted as an untrusted attestation. |
| Write `export_policy.allowed_fields` and `reader.profile`, and leave the rest of both blocks as you found them. | Touch `export_policy.recipient_scope`, `granularity`, `delivery` or `private_marker`. Dropping the marker turns off both sentinel guards silently, because each one is conditional on its presence. |
| Call the Finding a draft, and say which facts are recorded. | Describe it as verified, approved, reviewed or complete-and-trusted. Those are separate facts a human establishes. |
| State the falsifier `/checked-analysis` recorded, or that none exists yet and who owns writing it. | Invent a falsifier, a threshold, a definition or a caveat to fill a template slot. |
| Write the Finding `inconclusive` when the pre-registered falsifier fired, and name in the Answer what it asked and what the data showed. | Keep `answered` over a fired falsifier, loosen the Check, or write a second falsifier once the first one failed. |
| Write "not available" where a value is null or a denominator is zero. | Write 0, a blank or a dash. |
