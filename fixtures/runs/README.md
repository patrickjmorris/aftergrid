# Recorded runs

Finished Finding directories, replayed by the golden eval's fixture analyzer so the assertion machinery can be
tested without a model in the loop. Contract: [`docs/contracts/eval.md`](../../docs/contracts/eval.md).

```
fixtures/runs/<golden id>/output/          # a recorded run for that Golden Question
fixtures/runs/4ka-<golden id>/output/      # the same thing, named by the bead that recorded it
```

`createFixtureAnalyzer` looks for the plain id first, then the `4ka-` prefixed directory, and **declines** when
neither exists. A declined case is recorded `not_run` with the reason; it is never a pass.

## What is here

| Directory | Golden Question | Provenance |
| --- | --- | --- |
| `4ka-onboarding_checklist_retention/output` | `onboarding_checklist_retention` | Copy of the reviewed exemplar `fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention`, minus `render/`. |
| `4ka-price_change_cancellations/output` | `price_change_cancellations` | Copy of the reviewed exemplar `fixtures/instance/analytics/findings/2026-09-15-price-change-cancellations`, minus `render/`. |

**No model produced either of these.** They are hand-authored exemplars replayed as if an analyzer had produced
them, which is enough to exercise every assertion and nothing more. `model` is `null` in the resulting record,
and the first end-to-end eval with a live model has not been run.

`render/` is left out because the eval reads the manifest, the memo and the saved results only; a render is
regenerated from validated source.
