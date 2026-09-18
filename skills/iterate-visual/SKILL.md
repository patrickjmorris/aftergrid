---
name: iterate-visual
description: "Inspect and improve an analytical chart for truthful comparisons, visible denominators and uncertainty, readable labels, and agreement with its claim. Works with charts from any tool."
user-invocable: false
---

# Improve a chart

Start from the user's chart, image, notebook, spreadsheet, or chart code. Preserve its data and meaning. No chart library or CLI is required. For an aftergrid Finding chart, follow [the Engine procedure](references/engine-workflow.md), which supplies its renderer and revision rules.

## Inspect the rendered result

Identify the question, intended reader, claim, source, units, population, and comparison. Open the rendered image when a viewing tool is available. If only code or a table is supplied, say which visual properties remain uninspected; do not claim to have seen clipping, labels, or color contrast from code alone.

## Decide what obstructs understanding

Read [the portable rubric](references/portable-rubric.md). Focus on the problems the actual chart exhibits. Check if the chart type supports the task: position/length for comparisons, ordered time for change, distributions for spread, scatter for relationships. A table may be better for a few exact values.

Check denominators and units before aesthetics. Rate differences can reflect changed population weights; category totals cannot silently imply individual behavior. Keep incomplete periods and uncertain comparisons visible. Use zero baselines for length-encoded bars; an appropriately labeled nonzero range on a line or scatterplot can be legitimate. Do not truncate or rescale to exaggerate the story.

Make the title state the defensible claim, with its limitation when material. Label series directly when practical. Use emphasis to direct attention to the comparison that supports the answer, including a null or inconclusive outcome. Color should carry meaning consistently and never be the only way to distinguish a series.

## Revise and verify

Make the smallest changes that fix the important problems, render again if possible, and inspect the result at the intended reading size. Stop once those problems are resolved; repeated redesign is not evidence of quality. Keep data transformations explicit and rerun the calculation if the change needs a different population or aggregation. Report changes of interpretation separately from presentation changes. Deliver the improved artifact, unresolved limitations, and what you actually inspected.
