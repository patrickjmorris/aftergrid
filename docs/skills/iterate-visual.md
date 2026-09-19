# iterate-visual

## What it does

Looks at the *rendered* chart — or says which properties it could not inspect from code alone — and makes the smallest changes that would otherwise mislead a reader.

A chart that scores well against the wrong comparison is still the wrong chart. The skill preserves data and meaning; a change that alters the population or aggregation is a calculation change, not a restyle.

## When to reach for it

Ask in plain language. The agent reaches for it when a chart is about to be shown. Hidden from the Claude Code slash menu.

Use it when a figure is hard to read, emphasizes a claim the prose retreats from, or encodes length from a truncated baseline. Use [write-finding](write-finding.md) if there is no answer yet. Use [revise-finding](revise-finding.md) to change a chart that has already been reviewed. Use [shape-narrative](shape-narrative.md) when the title and caveat in prose are the problem.

## Inspect the image, then the claim

Check denominators and units before aesthetics. Rate differences can be mix. Keep incomplete periods visible. Use zero baselines for length-encoded bars. Direct labels beat a legend the reader cannot use. The title states the defensible claim, including a null or inconclusive outcome. Stop once the important problems are gone.

## Common questions

**Can it judge clipping from Vega-Lite JSON?** Not honestly. If only code is supplied, say which visual properties remain uninspected.

**Is a table allowed?** Yes, and often better for a handful of exact values.

**Does a prettier chart make the analysis true?** No. Recolor is not identification.

## It's working if

- The title agrees with the claim and its material limitation.
- The comparison the decision depends on is visible at the intended reading size.
- Presentation changes are reported separately from interpretation or calculation changes.
- Unresolved limits (uninspected contrast, unseen render) are named.

## Where it fits

Model-invoked Explain-stage craft, usually after [write-finding](write-finding.md) and before [shape-narrative](shape-narrative.md).

## Engine Finding reference

Existing Engine checks and approval requirements still apply.


## What it does

`/iterate-visual` renders each chart in a Finding to PNG, looks at the image, scores it against a seven-item
rubric seeded from *Storytelling with Data*, and revises the spec. At most three passes. It stops the moment
every item passes, and hands a chart that still fails one back to the Operator with the failing items and a
next step.

It is **model-invoked** (`user-invocable: false`, `policy.allow_implicit_invocation: true`). The visual loop is
craft inside writing a Finding, so an agent reaches for it mid-task. The human-facing entry point for changing
a Finding that has already been reviewed is `/revise-finding`.

The rubric is [`skills/iterate-visual/references/visual-rubric.md`](../../skills/iterate-visual/references/visual-rubric.md):
`declutter`, `one_message`, `title_states_claim`, `direct_labels`, `grey_plus_accent`, `colorblind_safe`,
`axis_not_truncated`. Each is a yes/no question answerable from the image.

Rejected candidates are kept as **Variants** — `charts[]` entries carrying `variant_of` and the surviving
chart's `result_id`. Only charts without `variant_of` render, so a Variant costs the Reader nothing and the
evidence behind every candidate is the same pinned result set. With an Operator in the loop, the PNG previews
go to them and the choice is theirs; in a background run the skill picks the highest score and says that is
what it did.

## When to reach for it

- A chart spec has just been written or changed and nobody has looked at the image.
- A Finding is about to be rendered for a Reader.
- A chart is hard to read — values to estimate off an axis, a series nothing names, every category a different
  color.
- You want the same chart tried two ways and the Operator to choose.

Not for a chart that is *wrong* rather than unreadable. Rebinding a chart to a different field or narrowing a
position axis changes what it asserts; that goes through `aftergrid revise`, which classifies it as an
interpretation change.

## Common questions

**Is the score a gate?** No. It is advisory, and it never substitutes for a Check, an evidence reference or a
review. A chart scoring seven out of seven against the wrong result set is still the wrong chart.

**Why three passes?** Because a fourth is usually taste, not legibility, and taste is the Operator's. Three is
a maximum, not a quota: a chart that passes on the first look is done on the first look.

**What if the third pass still fails?** The chart goes back, by name, with the failing rubric ids, the notes
from the last pass and one concrete next step. It is never recorded as passing.
`fixtures/runs/kn3-visual/three-passes-still-failing/` is that ending, recorded.

**Does a returned chart come off the page?** Not by itself. Returning it is a report, not an edit: the Claim
still lists it in `chart_ids`, the memo still carries its marker, and it still renders. Holding it back is the
Operator's separate decision, and it takes two edits together — the id out of the Claim's `chart_ids` and the
marker out of the memo. On a Finding that has been pinned, that is a revision, so it goes through
`/revise-finding`.

**Why is there no legend on my chart?** Because the pinned house style disables legends
(`src/render/charts.ts`). Nothing a `text` mark does not write is on the image, which is why `direct_labels` is
the item that decides whether a Reader can name a series at all.

**How do I add direct labels inside the validated subset?** A layered `text` mark bound to a field the chart
already shows, with `format` doing the formatting.
`fixtures/runs/kn3-visual/first-pass-passes/pass-1.vl.json` is a working example. `src/revise.test.ts` renders
every recorded spec through the real renderer and holds the recorded verdicts to the image it produces — the
palette, the compiled axis domain and the absence of a legend — so neither the examples nor the notes about
them can rot.

**Where does the title live?** In `charts[].title` in the manifest, not in the spec, and it may contain
evidence tokens. Fixing `title_states_claim` is a manifest edit.

**The PNG has no text in it.** The WASM rasterizer found no TrueType font. Set `AFTERGRID_FONT` to a `.ttf` and
render again — scoring an image with the text missing scores the wrong image.

## It's working if

- Every rubric item has a verdict and a note naming what in the image decided it, and nothing in a note
  describes something the renderer cannot draw.
- The recorded score is the count of `yes` verdicts, never higher.
- A chart that passes on pass 1 uses one pass.
- A chart still failing after pass 3 comes back with its failing item ids, a next step, and a true statement of
  whether it is still on the Reader's page — it is, unless the Operator asked for it to be held back.
- Rejected candidates are in `charts[]` with `variant_of` set and the survivor's `result_id`, and none of them
  appears in `render/finding.html`.
- `aftergrid check` still reports `evidence valid` after the specs change.
