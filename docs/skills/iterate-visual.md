# iterate-visual

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
- A chart is hard to read — a legend to decode, values to estimate off an axis, every category a different
  colour.
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

**How do I add direct labels inside the validated subset?** A layered `text` mark bound to a field the chart
already shows, with `format` doing the formatting.
`fixtures/runs/kn3-visual/first-pass-passes/pass-1.vl.json` is a working example, and `src/revise.test.ts`
renders it through the real renderer so the example cannot rot.

**Where does the title live?** In `charts[].title` in the manifest, not in the spec, and it may contain
evidence tokens. Fixing `title_states_claim` is a manifest edit.

**The PNG has no text in it.** The WASM rasterizer found no TrueType font. Set `AFTERGRID_FONT` to a `.ttf` and
render again — scoring an image with the text missing scores the wrong image.

## It's working if

- Every rubric item has a verdict and a note naming what in the image decided it.
- The recorded score is the count of `yes` verdicts, never higher.
- A chart that passes on pass 1 uses one pass.
- A chart still failing after pass 3 comes back with its failing item ids and a next step, and is not in the
  render.
- Rejected candidates are in `charts[]` with `variant_of` set and the survivor's `result_id`, and none of them
  appears in `render/finding.html`.
- `aftergrid check` still reports `evidence valid` after the specs change.
