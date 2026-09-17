# Stopping and resuming

Two files carry a stopped run: `analysis-progress.yaml`, which says where the run is, and the manifest, which
says what state the Finding is in. Between them, a run that stopped last week can be picked up without asking
anyone what happened.

## `analysis-progress.yaml`

Lives beside `manifest.yaml` in the Finding directory. Rewritten at the start and the end of every stage. It
is orchestration bookkeeping, not evidence: it is outside the content digest, no Claim may reference it, and
nothing in it reaches a Reader.

```yaml
stage: analysis_review          # clarify | checked_analysis | write_finding | iterate_visual |
                                # shape_narrative | analysis_review | check
status: needs_attention         # running | done | needs_input | needs_attention | permission_denied
reason: "Method review: the 7-day retention rate for the promo cohort has no stated denominator (c2)."
stale_definitions: []           # optional: definition ids whose Instance file moved after this run
updated: "2026-09-16T14:22:05Z"
```

- `stage` is the stage the run is in or stopped at, never the next one.
- `status: running` on a file older than the current run means an earlier attempt died mid-stage. Rerun that
  stage from the top; every stage is written to be safe to rerun against its own inputs.
- `reason` is empty only while `status` is `running` or `done`.
- `stale_definitions` names the definitions whose Instance file was improved after the run, so `check` reports
  `hash_mismatch` on their pins. The Finding pins the version it actually read and a new revision is the repair,
  never a re-pin; naming the ids is what keeps that tolerance to the definitions somebody accounted for
  (`scripts/examples-check.mjs`). The halt `reason` naming them in prose does the same job.
- `updated` is UTC ISO-8601.

Resuming means reading `stage` and `status`: `done` starts the next stage, anything else restarts `stage`.

## Halting with `needs_input`

A person owes the run something. Write it in the manifest so `aftergrid check` reports it as named missing
content rather than as an error:

```yaml
finding:
  state: needs_input
  needs_input:
    - kind: definition_approval
      description: "habit_creation_rate is proposed; a published decision metric needs an approved version."
      owner: "the definition's owner in definitions/habit_creation_rate.md"
```

`kind` is a stable word — `clarification`, `definition_approval`, `provisional_sign_off` — so intake and the
Operator can both route it. `owner` names who can supply it, never "the user".

Leave every artifact produced so far in place. A half-finished Analysis with three queries and two results is
worth more than an empty directory, and `check` reports it as incomplete, which is accurate.

## Halting with `needs_attention`

The run produced something a person must look at. The Finding keeps whatever state it reached — `complete` for
a reviewed draft with blocking findings, `draft` otherwise — and `analysis-progress.yaml` carries the reason.

Blocking review findings are already recorded in `reviews[]` by `/analysis-review`; do not restate them in the
manifest. `aftergrid review status <dir>` reprints them with the reviewer that raised each one.

A `check` error goes into `reason` as its category and location, so the next person knows whether they are
looking at a broken execution or at a disagreement about method.

## The chain ends with `aftergrid review status`

The last two commands of every run, in this order, are `aftergrid check <dir>` and then
`aftergrid review status <dir>`. Nothing runs after them. Any edit after a review — a reworded sentence, a
re-pinned definition, a chart swapped — changes the content digest and leaves every recorded review bound to
content nobody read, so **an edit after a review sends the run back to `analysis_review` and both commands run
again before it may report the Finding as reviewed.**

`review status` answers in the exit code as well as in prose, so a headless run cannot miss it
(`docs/contracts/analysis-directory.md`): **0** when every required kind's newest review is at the current
digest and `check` found no error, **1** when a required kind's newest review is stale or missing. It prints
two lines the run's final report quotes verbatim, rather than retelling them:

```
reviews: 3 current, 3 superseded, 0 stale
verdict: continue (reviewed by agents with no blocking findings; …)
```

Two of those three counts are not problems, and telling them apart is the whole point:

- **`stale`** — the kind's **newest** review is bound to other content. **Re-run that review**: invoke
  `/analysis-review` for the kind and record the new one at the digest the Finding carries now. **Never
  re-pin.** Editing a recorded review's `content_digest` to match the files makes a reviewer say they read
  bytes they never saw; it is the review-side twin of loosening a falsifier after seeing its result.
- **`superseded`** — the review is behind a later review of the same kind at the current digest. That is
  **history, not staleness**, and it is not a reason to review anything again. The kind *is* reviewed; the
  older entry is the record of the round before. `aftergrid review record` dedupes on (kind, reviewer,
  digest), so a re-review ordered on account of a superseded entry writes nothing at all.
- **`current`** — bound to the digest the Finding carries now. This is the count that decides whether the run
  may say "reviewed".

This is not hypothetical. `examples/nyc-open-data/docs/run-log.md`, Citi Bike run 2: the Finding carried three
current reviews at the final digest and three superseded round-1 reviews at the earlier one. `review status`
warned about the round-1 entries, the run's own summary said "three current reviews, no blocking findings" in
its own words, and the Operator read the warnings as "all reviews stale" and spent run 3 ordering three
re-reviews. Run 3 correctly discovered there was nothing to record and stopped. One quoted counts line would
have cost nothing and saved that run.

## Halting with `permission_denied`

The harness refused a write inside the Finding directory. This is not the Analysis saying anything: the run
never got to have an opinion, and neither the data, the method nor the Operator is the blocker. The tooling is.

**Stop at the refusal.** Do not route around it — no writing the same bytes through a shell redirect, `mkdir`,
`cat > `, a heredoc, `git`, an editor, a copy into `/tmp` and back, a different CLI flag, or a second tool that
happens not to be refused. A refusal that a run walks around is a permission system that stopped existing, and
the Finding it produces was written by a run nobody sanctioned. One attempt through the tool the stage normally
uses, then stop. (This halt exists because a real run — `examples/nyc-open-data/docs/run-log.md`, run 1 — hit
sixteen refusals across eight paths and stopped, correctly, with nothing written.)

Then:

1. **Write `analysis-progress.yaml` only if it is writable.** `stage` is the stage that was refused, `status`
   is `permission_denied`, `reason` is the harness's own denial text. The artifact lives in the same directory
   that just refused a write, so attempting it once and failing is the expected case, not an error to report
   twice.
2. **In every case — written or not — print the halt as the LAST line of the final message**, as a single JSON
   object on one line:

```json
{"aftergrid": "halt", "status": "permission_denied", "stage": "checked_analysis", "paths": ["analytics/findings/2026-09-17-x/checks/minimum_data.sql", "analytics/findings/2026-09-17-x/analysis-progress.yaml"], "reason": "Claude requested permissions to edit <path> which is a sensitive file"}
```

   `paths` lists every path that was refused, the progress file included when that is one of them. `reason`
   quotes the denial text as the harness gave it, never a paraphrase and never a diagnosis of the cause.
   Nothing follows that line: a headless harness reads the run's own stdout, and it is the only channel left
   when no file could be written (`docs/contracts/eval.md`; `src/eval/runner.ts` reads it out of the CLI's
   `--output-format json` envelope and records the case as infrastructure, never as an analytical failure).

3. Say the same thing in words above that line, for a person: which stage, which paths, the denial text, and
   that the run stopped rather than worked around it.

A `permission_denied` halt is resumable in the ordinary way once the harness is configured to allow the write:
every artifact that did get written stays, and the stage is rerun from the top.

## What is not a halt

**A failing pre-registered falsifier.** A falsifier that records the outcome it did not expect is the Analysis
working as designed: it said in advance what would show the Answer wrong, and that observation happened. The run
**continues** — set `analysis.yaml#/outcome_recommendation.outcome` to `inconclusive` (or `needs_reframing`
where the Question itself is the problem) and go on to `/write-finding`, `/shape-narrative` and
`/analysis-review` as normal. The Finding this produces is the point of the whole system, and halting at
`needs_attention` leaves it unwritten.

`check` reports a fired falsifier as a `falsifier_failed` **warning**, not an error, and `render` writes the
page with the falsifier on it (`docs/contracts/checks-and-results.md`). A falsifier Check is never
`required: true`; if it is, `check` reports `check_shape` and that *is* a halt — fix the shape, do not change
the Check's threshold, `expected_outcome` or SQL, which after seeing the result would be the one edit this whole
mechanism exists to prevent.

The Operator still has a decision to make — accept the inconclusive Finding, or open a revision with a newly
pre-registered Question — but they make it about a written Finding they can read, not about a halted directory.

**A review superseded by a later one of the same kind at the current digest.** The kind is reviewed. The
older entry is history, `review status` counts it as `superseded` rather than `stale`, and the run neither
halts nor re-reviews on account of one.

**A missing or unconfigured adapter.** The recorded data path is the default (ADR 0010,
`docs/contracts/record.md`): the harness runs the SQL and `aftergrid record` writes down what it ran. There is
no stage, status or `needs_input` kind for an absent adapter, and writing one would stop a run that can finish.
What it costs is recorded on the Finding instead — `snapshot.guarantees: [artifact_replay]`, Check outcomes
reported by the harness, `check --mode rerun` refused with `rerun_unavailable`, no Revisit — and reported to the
Operator in those words.

## What never happens at a halt

- No Claim, number, definition, approval or falsifier is invented to get past the stage.
- No review is recorded on the run's behalf, and no attestation is written.
- No outcome is set to `answered` to make the run finish.
- Nothing already produced is deleted.
