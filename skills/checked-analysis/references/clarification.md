# Clarification: turning a raw ask into a Question

The procedure `/grill-question` runs on its own and `/checked-analysis` runs inside a larger job. One copy, so
the Operator gets the same interview either way — and so no user-invoked skill has to call another one.

A **Question** is a raw ask plus six settled parts: decision, Reader, metric, population, window, primary
comparison — and a falsifier, or an explicit record that one cannot be written yet. A raw ask is never rejected
for lacking them. Settling them is the work.

## Read before you ask

Everything already recorded is **settled**, and a settled part is never a question. Read, in this order:

1. `<finding-dir>/manifest.yaml` — `question` (including `unresolved`), `reader.profile`, `finding.needs_input`.
2. `<finding-dir>/analysis.yaml` — `assumptions`, `pre_registered_comparison`, `needs_input`.
3. `<instance>/readers.md` — the Reader profiles. One profile is the answer, not a question.
4. `<instance>/definitions/*.md` — id, version, `kind`, `lifecycle`, grain, population, denominator, window.
5. `<instance>/aftergrid.yaml` — the owner and the source.

Completion criterion: you can name, for each of the seven parts, either its settled value and where you read it,
or the fact that nothing records it.

## Ask in rounds

Work the **frontier**: every unsettled part whose prerequisites are already settled. Ask the whole frontier in
one round, numbered, each with your recommended answer, then wait.

```
❓ **Q1** — **<what is being settled>**: <the choice, and why it changes the analysis>

➡️ <your recommended answer>
```

Each answer reshapes the frontier. Recompute it and ask the next round. A question whose answer depends on
another question still open belongs to a later round.

**Ask only what changes the analysis.** A question passes when a different answer would change the metric, the
population, the window, the comparison, the falsifier, the Reader, or what counts as a material caveat. A
question that only makes the memo read better is not a clarification question.

**Facts are yours to find, never the Operator's.** How many rows are in the window, whether a column exists,
whether events arrive late: probe the catalog and the data through the harness's own tool — or, where the
Instance configures an adapter, through the retained inputs. Ask the Operator only for decisions.

Completion criterion: the frontier is empty — every part settled, or explicitly recorded as unsettled with the
reason. Say which it is, and wait for the Operator to confirm before writing.

## The seven parts, and what each round is really settling

| Part | Settled when you can state | Where it lands |
| --- | --- | --- |
| Decision | The decision this informs, and who owns it | `question.decision` |
| Reader | A profile id from `readers.md`, or `generic` | `reader.profile`, `analysis.reader_profile` |
| Metric | A definition id **and version**, with its lifecycle | `question.metric` |
| Population | Who is counted, in words a Reader repeats correctly | `question.population` |
| Window | Start, end, and the **analytical timezone** | `question.window` |
| Primary comparison | What is compared with what, before any cut is explored | `question.primary_comparison` |
| Falsifier | What observation would show the Answer wrong, as a Check | `question.falsifier` |

The window's timezone is part of the window. A calendar month in New York and a calendar month in UTC disagree
at both ends, and the disagreement moves rows.

## Challenge the vocabulary against CONTEXT.md

Reader-facing copy uses plain words. The *structure* uses the glossary, and three collisions come up every time:

- **A causal word in the ask** — "helped", "drove", "caused", "because". A causal Claim is earned by a design
  that supports it, normally random assignment. Ask what the design was. When it was not random, the Claim is
  associational and the memo says so.
- **A bare metric name** — "retention", "engagement", "active". Name the Metric definition and version, or
  propose one. A word with no definition behind it is the commonest way a number ends up plausible and wrong.
- **A word the Instance already owns differently** — the ask says "signups", the definition counts "completed
  signup". Put the difference to the Operator; do not quietly pick one.

Completion criterion: every term in the Question either matches a definition in the Instance, matches the
glossary, or was put to the Operator and answered.

## Proposing a definition

When no approved definition fits, write a proposal to `<instance>/definitions/<id>.md`:

- `lifecycle: proposed`, and **no `approval:` block**. Approval is an attestation an Operator records against
  the file's content hash; a front-matter field is display only.
- `kind: metric` for something a decision could rest on, `kind: diagnostic` for a calculation used inside the
  Analysis. Kind and lifecycle are separate axes.
- Front matter: id, version, kind, lifecycle, grain, population, denominator, window, owner. Body: the plain
  meaning, then canonical SQL per dialect under `## SQL (<dialect>)`.
- Reference implementation of the exact bytes: `proposeDefinition` in `src/analysis/definitions.ts`.

**Never edit a file whose front matter says `lifecycle: approved` or carries an `approval:` block.** When the
Question needs a change to an approved definition, that is a `needs_input` item of kind `definition_approval`
naming the Operator, and the Analysis stops there for that metric.

A proposed definition may back a supporting or diagnostic Claim, with its status shown. It may never be the
published decision metric.

## Writing the result

Into `manifest.yaml`:

- `question.raw_ask` — the ask verbatim, always, whatever the rounds settled.
- Every settled part in its field.
- `question.state`:
  - `resolved` — all seven settled, and the falsifier is a Check file with an expected outcome.
  - `unresolved` — `unresolved: [...]` lists exactly the parts that are not settled, and the unsettled fields
    are **absent**, not filled with a plausible value.
  - `not_answerable` — the ask cannot be answered as posed; the Finding's outcome will be `needs_reframing`.
- `reader.profile`.

Into `analysis.yaml` (`docs/contracts/analysis-directory.md`): `stage: clarified`, `reader_profile`,
`clarified_at`, one `assumptions` entry per choice the rounds made with its `basis`, `pre_registered_comparison`
with `registered_before_cuts: true` when it was settled before any data was read, and a `needs_input` entry for
anything left to a named owner.

`clarified_at` is the harness's clock at the moment the Question was settled, read then rather than worked out
later. It is what makes "clarify before capture" checkable: `check` reports `capture_before_clarify` for any
Snapshot input whose `captured_at` is earlier than it. Where the Question stays `unresolved`, there is no
moment to record and the field is left out.

`stage: clarified` is what makes that file complete for where it is. The four sections `/checked-analysis`
fills — `probes`, `execution_order`, `candidate_claims`, `outcome_recommendation` — are required only at
`stage: analysed`, and a file that omits the stage is read as `analysed` and reported as missing them.

**Never write a falsifier you cannot run.** A threshold picked after seeing the numbers is a bar set to fit its
own result. When no evaluable falsifier exists yet, leave `falsifier` out, list it in `unresolved`, and record a
`needs_input` item naming who sets the bar and before what.

## Re-entering a clarification

A second pass over the same Finding asks only about parts in `question.unresolved` and about `needs_input` items
whose owner has answered since. Restate the settled parts back to the Operator as a list they can correct —
a correction is cheap and a re-interrogation is not.

**When the analysis sends the Question back.** Where a look mid-run changes the Question rather than the plan —
the metric cannot be computed, the population is not the one the decision needs, the ask turns out to be
associational — record it in `analysis.yaml#/probes` as a `kind: reframe` entry with its `at`, what it asked,
what it showed, and a `changed_plan` naming the Question before and after and pointing at this revisit if one
was run. The probe is where the reframe is visible afterwards; `question.unresolved` and the manifest carry only
the Question as it ended up.
