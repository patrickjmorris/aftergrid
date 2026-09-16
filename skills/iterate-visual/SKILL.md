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

Editing a chart spec changes content the digest covers, so **every pass after the first starts by re-pinning
`content_digest` with `digestOf` from `scripts/lib/validate-finding.mjs`** — the same re-pin `/write-finding`
step 9 and `/shape-narrative` step 6 do. Until you re-pin, `render` refuses and `check` reports a `digest`
error whose remedy names a `check --pin` flag that does not exist. There is no CLI command for this: re-pin in
code, from the Finding directory the edit is in.

`render` also refuses when the evidence does not verify. That is not the chart's problem: fix what the report
names. If the Finding has already been pinned and reviewed, do not re-pin the digest underneath its review —
hand the chart to the Operator for `/revise-finding`, which bumps the revision instead.

If the PNG has no text in it, the WASM rasterizer found no TrueType font and said so in the report. Set
`AFTERGRID_FONT` to a `.ttf` and render again; scoring an image with the text missing scores the wrong image.

Done when you have opened a PNG for every chart from step 1.

## 3. Score one pass

Score the image against every item in [`references/visual-rubric.md`](references/visual-rubric.md). Each item
gets `yes` or `no` and a one-line note naming **what in the image decides it** — the bar whose value you had to
estimate, the series nothing on the image names, the axis that starts at 20%. A note about something the image
does not contain is a fabricated observation, not a low score.

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
  formatting. That is the expected fix for `direct_labels`, and it is the only way a value reaches the image:
  the pinned house style sets `legend: {disable: true}`, so **no chart this renderer draws has a legend**, and a
  series nothing labels is a series the Reader cannot name.
- Colour lives in the spec as a `scale` with an explicit `domain` and `range`: the one category the Claim is
  about in the accent, everything else in grey. The house style's categorical range already starts accent, grey,
  so pinning the scale is what stops the accent depending on the order the categories arrive in.
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

A Variant costs nothing while it sits off the page, and its spec is never compared with anything. Putting one
**on** the page is where it is paid for: `aftergrid revise` classifies a promoted Variant's spec against the
spec of the chart it replaces, so a candidate carrying a truncated axis or another field binding is an
interpretation change at the moment it is chosen, not a taste decision.

Done when every rejected candidate is either deleted from `charts/` or recorded as a Variant of the survivor.

## 6. Hand back a chart that still fails

After three passes with an item still `no`, the chart goes back to the Operator. Do not record it as passing,
and do not quietly ship it.

Give them, for this chart:

- the id and the Claim it backs;
- every failing item, by rubric id, with the note from the last pass;
- what you tried across the three passes;
- **a next step** — the specific thing you would do next and the decision you need from them ("with no legend
  the two arms are never named, and the subset cannot label one bar only; either two labelled lines instead of
  twelve bars, or name the arms in the Claim's prose and carry the numbers in the table");
- **where the chart is now**: returning it does not take it off the Reader's page. It still renders, and it
  still has to, because the Claim lists it in `chart_ids` and the memo carries its `<!-- chart: id -->` marker.

Holding it back is a second, separate decision, and it is the Operator's — on a pinned Finding it is a revision,
so it goes through `/revise-finding`. When they ask for it, two edits together do it and nothing else does:
drop the id from that Claim's `chart_ids` **and** delete its marker from the memo. Neither edit alone does it:
dropping only the marker fails `check` and `render` with `chart marker for <id> missing in Claim <c>`, and
dropping only the id changes nothing on the page, because the memo's marker is what puts the figure there. The
chart's SVG is still written to `render/`; what changes is that the Reader's page no longer shows it.

In a background run there is no Operator to decide: report the chart as returned with its failing items, leave
it on the page, and say that holding it back is a decision nobody made.

Done when the Operator has the failing items by name, one concrete next step, and a true statement of whether
the chart is still on the page.

## 7. Re-check what you changed

```bash
aftergrid render <finding-dir> --png
aftergrid check <finding-dir>
```

Every chart you touched has to render and the Finding has to stay evidence-valid. A `chart_subset` error means
you left the subset; a `missing_column` or `export_policy` error means you bound a field the result does not
declare or the export policy does not allow; a `digest` error means step 2's re-pin has not been done since your
last edit.

Done when `check` reports `evidence valid` and every chart you changed has a fresh SVG. Report what `check`
actually said — a chart you returned in step 6 does not make the Finding invalid, and a Finding that is still
invalid is not "done".

## What to report

Per chart: the passes used, the verdicts of the final pass, whether it passed or was returned, and the
Variants recorded. Say the score is advisory — it is not a Check, not an evidence reference and not a review,
and a chart that scores seven out of seven against the wrong result set is still the wrong chart.

Recorded runs showing both endings: `fixtures/runs/kn3-visual/`.
