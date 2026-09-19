# Recorded run: onboarding checklist (answered)

A synthetic acceptance run for `/grill-question` and `/checked-analysis`, on the same synthetic data as the
reviewed exemplar Finding `fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention/`.

**How it was produced.** By hand, following the two skills step by step, against that Finding's data and the
fictional Instance around it. **No model was in the loop**, so nothing here is evidence that a model runs the
skills correctly; it is evidence about the artifacts the skills are required to leave behind, and it is the
fixed input `src/analysis.test.ts` validates. A model-in-the-loop evaluation is a separate, later task.

| File | What it is |
| --- | --- |
| `raw-ask.md` | The Operator's ask in their own words, and the clarification rounds that followed, with the recommended answer shown for each question. |
| `clarification-rounds.yaml` | The same rounds, machine-readable: what each round asked, what it settled, and what a second pass over the Finding would ask. It is what makes "no settled part is asked twice" a test rather than a sentence. |
| `clarified-question.yaml` | What `/grill-question` writes into `manifest.yaml`: the `reader` and `question` blocks, Question state `resolved`. |
| `analysis.yaml` | What `/checked-analysis` leaves beside `manifest.yaml` (`docs/contracts/analysis-directory.md`), validated against the exemplar's manifest. |
| `proposed-definitions/platform_group.md` | The one definition this run proposed: a Diagnostic calculation, `lifecycle: proposed`, no approval block. `retained_7d` was already approved and was used as it stood. |

**What the run demonstrates**

- The raw ask names no metric, population, window or falsifier; the clarified Question names all four.
- Four rounds settle the tree, no round asks about a part an earlier round or the Instance had already settled,
  and a second pass over the resolved Question asks nothing at all — checked against
  `clarification-rounds.yaml`, with a mutated copy as the negative control.
- Every Check is written and run before the first analysis query, and `execution_order` records it in that order.
- The platform split is labeled exploratory in `execution_order` and in the Claim that rests on it.
- The grouping the split needs is a Diagnostic calculation, proposed and not approved; the decision metric
  (`retained_7d` v2) was already approved and the run did not touch it. The proposal's canonical SQL is the
  expression the query actually ran, and both the definition and the Claim say that "web" means *not mobile*.
- The Analysis recommends `answered`, and the writer's output on it is the exemplar Finding.
