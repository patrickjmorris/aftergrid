# Recorded `/iterate-visual` runs

Two hand-authored transcripts of the visual loop, kept as fixtures because the loop itself cannot run in a test:
it needs a model to look at a PNG and say what it sees. **Neither run was produced by a live model.** They are
the record of what the skill must do, and `src/revise.test.ts` holds them to it.

| Run | What it records |
| --- | --- |
| `first-pass-passes/` | The chart already satisfies every rubric item. The loop stops at pass 1. Its `pass-1.vl.json` is the direct-label spec: a layered `text` mark bound to a field the chart already shows. |
| `three-passes-still-failing/` | Three passes, each an improvement, and one rubric item still failing at the end. The chart goes back to the Operator with the failing item and a next step — never recorded as a pass. |

Both runs score charts against `skills/iterate-visual/references/visual-rubric.md`. The test fails if a run
names an item the rubric does not define, records a score above the count of `yes` verdicts, runs a fourth
pass, or calls a chart accepted while an item is `no`.

`run.json`:

| Field | Meaning |
| --- | --- |
| `run_id`, `recorded` | The run's name, and the plain statement that no model produced it. |
| `rubric` | The rubric file the verdicts were scored against. |
| `chart_id`, `result_id` | The chart worked and the result set it is bound to. Every pass keeps both. |
| `passes[]` | `pass` (1-based), `spec` (the spec as it stood when it was scored), `items[]` (`id`, `verdict`, `note`), `score`, and `revision` (what changed going into the next pass; absent on the last). |
| `outcome` | `accepted` with the surviving `spec`, or `returned_to_operator` with `failing_items` and a `next_step`. |
| `variants[]` | Rejected candidates kept for the record: the `chart_id` each would carry, `variant_of` naming the survivor, and the `result_id` they share with it. |

Both runs bind a result set of the numeric exemplar, and not the same one:

| Run | `result_id` | Columns the specs name |
| --- | --- | --- |
| `first-pass-passes/` | `retention_by_arm` | `arm`, `retained_7d_rate` |
| `three-passes-still-failing/` | `retention_by_week_arm` | `signup_week`, `arm`, `retained_7d_rate` |

`src/revise.test.ts` renders `first-pass-passes/pass-1.vl.json` inside a copy of that Finding, so the
direct-label spec is held to the real Vega-Lite subset and the real renderer rather than to a description of
them. It also compiles **every** recorded pass spec against its own result set through the pinned house style,
and holds the recorded verdicts to that image: a note may not describe a legend (the house style disables
them), `grey_plus_accent` must be `yes` when the palette is the accent plus grey, and `axis_not_truncated` must
follow the compiled position-scale domain. A verdict about something the renderer cannot draw fails the test.
