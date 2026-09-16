---
name: iterate-visual
description: Render a Finding's charts, look at each one and revise it against the Storytelling with Data rubric. Use after writing or changing a chart spec, before a Finding goes to a Reader, or when a chart is hard to read.
user-invocable: false
---

# Iterate on a chart until it reads

You look at the rendered image, not at the spec. A spec that validates can still be a chart nobody can read,
and the only way to find out is to render it and look.

Three passes is a **maximum**, not a quota. Stop the moment every rubric item passes; hand the chart back when
the third pass still fails one. A chart that leaves this loop is either one you looked at and every item
passed, or one the Operator has been told about by name.

## 1. List the charts to work

Read `manifest.yaml`. The charts to work are the `charts[]` entries **without** `variant_of`: those are the ones
that render. An entry with `variant_of` is a rejected candidate kept for the record — leave it alone.

Done when you have the id, `claim_id`, `result_id` and `title` of every rendering chart.

## 2. Render and look

```bash
aftergrid render <finding-dir> --png
```

This writes `render/<chart_id>.png` beside `render/<chart_id>.svg`. Open the PNG and look at it.

`render` refuses when the evidence does not verify, and reports `digest` when the manifest no longer hashes to
its content. Both mean the chart is not your next problem: fix what it names, or, if the Finding has already
been pinned and reviewed, hand the chart to the Operator for `/revise-finding`, which bumps the revision rather
than editing a reviewed artifact underneath its review.

If the PNG has no text in it, the WASM rasterizer found no TrueType font and said so in the report. Set
`AFTERGRID_FONT` to a `.ttf` and render again; scoring an image with the text missing scores the wrong image.

Done when you have opened a PNG for every chart from step 1.

## 3. Score one pass

Score the image against every item in [`references/visual-rubric.md`](references/visual-rubric.md). Each item
gets `yes` or `no` and a one-line note naming **what in the image decides it** — the legend you had to read, the
bar whose value you had to estimate, the axis that starts at 20%.

The score is the count of `yes` verdicts and nothing else. Writing a score the verdicts do not add up to is
fabricating evidence about your own work.

Done when every rubric item has a verdict and a note, and the score equals the count of `yes` verdicts.

## 4. Stop, or revise

**Every item `yes`** — stop. Record the pass and move to the next chart. Do not spend a second pass polishing a
chart that already passes.

**Any item `no`, and you have used fewer than three passes** — revise the spec and return to step 2.

- Stay inside the validated Vega-Lite subset: no `transform`, no aggregate/bin/timeUnit encodings, no inline
  data, no URLs. The renderer binds the data; the spec names fields of its `result_id`.
- Direct labels are a layered `text` mark bound to a field the chart already shows, with `format` doing the
  formatting. That is the expected fix for `direct_labels`, and it is what lets you drop the legend.
- Colour lives in the spec as a `scale` with an explicit `domain` and `range`: the one category the Claim is
  about in the accent, everything else in grey.
- The title belongs to `charts[].title` in the manifest, not to the spec. Fixing `title_states_claim` means
  editing the manifest entry to the Claim sentence, tokens included.
- Keep the same `result_id` and the same fields. Binding a chart to a different field, or narrowing a position
  axis's `scale.domain`, changes what the chart asserts — that is a change of meaning, and `aftergrid revise`
  classifies it as one.

**Any item `no` after the third pass** — go to step 6.

Done when the chart has passed every item, or three passes are used.

## 5. Keep the candidates you rejected

A candidate you rendered and rejected is a **Variant**. Keep it: add a `charts[]` entry with a new id,
`variant_of` set to the id of the chart that survives, and the **same `result_id`** — Variants share one result
set and therefore one set of pinned evidence, which is what makes choosing between them a taste decision rather
than a change of evidence. Its spec file stays in `charts/`. Only charts without `variant_of` render, so a
Variant costs the Reader nothing.

Choosing between Variants:

- **An Operator is in the loop** — show the PNG previews, say what each one does better, and let them pick. The
  choice is theirs; say which one the rubric scored higher and leave it there.
- **A background run** — pick the highest rubric score, and say in your report that you picked it by score with
  no human in the loop.

Done when every rejected candidate is either deleted from `charts/` or recorded as a Variant of the survivor.

## 6. Hand back a chart that still fails

After three passes with an item still `no`, the chart goes back to the Operator. Do not record it as passing,
and do not quietly ship it.

Give them, for this chart:

- the id and the Claim it backs;
- every failing item, by rubric id, with the note from the last pass;
- what you tried across the three passes;
- **a next step** — the specific thing you would do next and the decision you need from them ("twelve labels do
  not fit at Reader width; either two labelled lines instead of twelve bars, or drop the labels and carry the
  numbers in the table").

Done when the Operator has the failing items by name and one concrete next step.

## 7. Re-check what you changed

```bash
aftergrid render <finding-dir> --png
aftergrid check <finding-dir>
```

Every chart you touched has to render and the Finding has to stay evidence-valid. A `chart_subset` error means
you left the subset; a `missing_column` or `export_policy` error means you bound a field the result does not
declare or the export policy does not allow.

Done when `check` reports `evidence valid` and every chart you changed has a fresh SVG.

## What to report

Per chart: the passes used, the verdicts of the final pass, whether it passed or was returned, and the
Variants recorded. Say the score is advisory — it is not a Check, not an evidence reference and not a review,
and a chart that scores seven out of seven against the wrong result set is still the wrong chart.

Recorded runs showing both endings: `fixtures/runs/kn3-visual/`.
