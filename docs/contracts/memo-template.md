# Memo template

`memo.md` is the canonical Finding text. Sections are fixed and in this order; `check` fails on a missing, extra or reordered section (category `template`). Reader-facing copy uses plain words; glossary terms may appear but are never required of the Reader.

```markdown
---
finding: fnd_xxxxxxxxxxxx
revision: 1
---

# <Title>

## Answer
One sentence. For an insufficient-data, inconclusive or needs-reframing outcome the sentence says so.
Immediately after: the material caveat of the answer-bearing Claim, as its own sentence, marked with the
`material_caveat` HTML comment marker so the render keeps them together.

## Decision it informs
One or two sentences: the decision, who owns it, what the options are.

## Evidence
### <Claim sentence>   <!-- claim: c1 -->
For a numeric Claim: at least one chart or table whose title states the Claim, then the prose.
Understand: who is counted, compared with what, over which period. Inspect: exclusions, calculation.
### <Claim sentence>   <!-- claim: c2 -->
...

## How we checked
Checks run and their outcomes; definitions used with lifecycle; any counter-metric the decision metric
names, with its value as a token or the reason it could not be computed; Snapshot guarantees; agent
reviews. Written as separate facts, never one badge. A falsifier that fired is named here as well as below.

## What would change our mind
The Question's falsifier in plain words (or why none can be written yet, and who owns that);
each Claim's Recheck policy in plain words; the earliest date a re-check is meaningful.
Where the falsifier already fired, this section says so and says what would settle the Question instead.

## Appendix
Queries by id and path; result sets by id; retained inputs; anything an Operator needs to rerun.
```

## Rules `check` enforces

- Front matter `finding` and `revision` match the manifest.
- Section headings exactly: `Answer`, `Decision it informs`, `Evidence`, `How we checked`, `What would change our mind`, `Appendix`.
- Every `### ` heading under Evidence carries a `<!-- claim: <id> -->` marker naming a manifest Claim; every manifest Claim has exactly one such subsection; heading text equals the Claim `sentence` after token resolution.
- The Answer section contains the `<!-- material_caveat -->` marker followed by the answer-bearing Claim's `material_caveat` text.
- Every numeral outside the allowed set in `docs/contracts/reference-grammar.md` is a token.
- Chart and table placement: `<!-- chart: <id> -->` and `<!-- table: <id> -->` markers inside the owning Claim's subsection; the renderer replaces them. A numeric Claim's subsection contains at least one.

## The inconclusive memo, when the falsifier fired

A pre-registered falsifier that recorded the outcome it did not expect makes the Finding `inconclusive` (or
`needs_reframing`), and the memo carries that rather than burying it. It is the good case, not a failure: the
Analysis wrote down in advance what would show the Answer wrong, that thing happened, and the write-up says so.

- **The Answer sentence says the Question is not settled**, and says it first. Not "the data suggest", not a
  hedged version of the Answer that was hoped for.
- **It names the falsifier and what the data showed**, in the Reader's words and in the same breath: what the
  falsifier asked, that it recorded `fail`, and the observation that made it fail. A memo that says
  "inconclusive" without saying which observation contradicted the Answer has told the Reader nothing.
- **The material caveat carries the falsifier too**, since it travels with the Answer everywhere the Answer goes.
- **"How we checked" lists the falsifier among the Checks**, with its recorded outcome, and states that it was
  not loosened, un-required or rewritten after its result was seen.
- **"What would change our mind" says what would settle the Question** — a longer window, a larger population, a
  differently framed Question — instead of repeating the falsifier as though it were still open.
- **The numbers stay.** The evidence is valid; it is the Answer that does not stand. Claims that the data do
  support are still made, still traced, and still rendered.
- Nothing is invented to soften it: no new threshold, no post-hoc cut promoted to the Answer, no second falsifier
  written after the first one fired.

## Where a counter-metric goes

A counter-metric the decision metric's definition names (`docs/contracts/instance-layout.md`) belongs in
**How we checked**, one line per counter-metric, beside the line that names the definition and its lifecycle:

```markdown
- Definition used: retained_7d v2, approved.
- Counter-metric named by that definition: habit creation within two days, {{ref:habit_by_arm.checklist.habit_creation_rate}}
  in the checklist arm against {{ref:habit_by_arm.control.habit_creation_rate}} in the other. Pushing 7-day
  retention with nudges would lift opens without anyone reaching a first real action; it did not here.
- Counter-metric named by that definition: support contacts per user — not computed. The support tool is not in
  the warehouse, so it cannot be measured over this window.
```

The number is a token like any other, so it is traced and the render gives it a provenance popover; the
manifest's `counter_metrics_reported` is what `check` reads (`docs/contracts/finding-manifest.md`) and the
render turns into its own fact. A counter-metric that moved the wrong way is not hidden in an appendix: the
Reader is told in *How we checked*, and if it changes the Answer it belongs in a Claim of its own.

## Rules a reviewer judges

Answer-first ordering, one idea per Claim, Reader-level language, whether "doubled" or "caused" is earned by the evidence, whether the caveat is the one that matters. These are the Method, Question and Reader reviews, recorded in `reviews[]`, never a lint.
