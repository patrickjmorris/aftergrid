# iterate-visual

## What it does

Looks at the *rendered* chart — or says which properties it could not inspect from code alone — and makes the smallest changes that would otherwise mislead a reader.

A chart that scores well against the wrong comparison is still the wrong chart. The skill preserves data and meaning; a change that alters the population or aggregation is a calculation change, not a restyle.

## When to reach for it

Ask in plain language. The agent reaches for it when a chart is about to be shown. Hidden from the Claude Code slash menu.

Use it when a figure is hard to read, emphasizes a claim the prose retreats from, or encodes length from a truncated baseline. Use [write-finding](write-finding.md) if there is no answer yet. Use [revise-finding](revise-finding.md) to change a chart that has already been reviewed. Use [write-finding](write-finding.md) when the title and caveat in prose are the problem.

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

Model-invoked Explain-stage craft, usually after [write-finding](write-finding.md) drafts the answer and before its narrative pass.

If you use the optional command-line tool, [this page](engine/iterate-visual.md) covers how this skill works with it.
