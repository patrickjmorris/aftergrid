# checked-analysis (retired)

This skill was folded into [`analyze`](../../analyze/SKILL.md). It duplicated most of `analyze` and `explore-data`.

- The portable discipline moved to `analyze`: the checks named before the main query, the analysis log, and the handover that separates executed checks from proposed ones.
- The repeated calculation rules moved to `references/rigor.md`, which `analyze` and the other skills ship.
- The Engine procedure moved to `skills/analyze/references/checked-analysis.md`. It is still the `checked_analysis` stage of an Engine run.
- The shared clarification procedure moved to `skills/analyze/references/clarification.md`, with an identical copy in `grill-question`.

This directory sits in the `deprecated` bucket and has no `SKILL.md`, so neither the plugin index nor a folder-scanning installer offers it.
