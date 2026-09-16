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
status: needs_attention         # running | done | needs_input | needs_attention
reason: "Method review: the 7-day retention rate for the promo cohort has no stated denominator (c2)."
updated: "2026-09-16T14:22:05Z"
```

- `stage` is the stage the run is in or stopped at, never the next one.
- `status: running` on a file older than the current run means an earlier attempt died mid-stage. Rerun that
  stage from the top; every stage is written to be safe to rerun against its own inputs.
- `reason` is empty only while `status` is `running` or `done`.
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

## What never happens at a halt

- No Claim, number, definition, approval or falsifier is invented to get past the stage.
- No review is recorded on the run's behalf, and no attestation is written.
- No outcome is set to `answered` to make the run finish.
- Nothing already produced is deleted.
