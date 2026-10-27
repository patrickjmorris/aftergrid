---
name: write-finding
description: "Turn analysis results into an evidence-linked answer a specific reader can act on: answer first, one claim per section, the decisive caveat beside the conclusion, in the reader's words. Also reorders and rewords an existing draft without changing its meaning. Works with ordinary files and optionally an Engine Finding."
user-invocable: false
version: 0.2.0
---

# Write a finding

Use supplied results and analysis notes to answer the reader's question, or reshape a draft that already answers it. A finding can be an ordinary memo, notebook summary, document, or message. No manifest or CLI is required. An aftergrid Finding gets one of two passes, never both in one call. If `memo.md` exists and its charts have settled (the `shape_narrative` stage, after `/iterate-visual`), run only [the Engine narrative pass](references/engine-narrative.md), and change no field it says to leave alone. Otherwise run [the Engine writing procedure](references/engine-workflow.md) for its typed claims, bound values, and fixed artifact contract, then stop: the narrative pass comes after the charts.

Read the question, results, assumptions, checks, and intended reader before writing. Identify the answer-bearing claim, who is counted, its baseline and window, and the caveat that would change what the reader does. Establish which conclusions were actually reached and which remain exploratory. If a piece is missing, name the gap rather than manufacturing it. A writer may clarify a conclusion; it may not invent a new calculation, promote a proposed definition to approved, or turn a correlation into a cause.

## Make the first paragraph sufficient

State the answer, population, comparison and period in language the reader understands. Put the caveat that could change their decision beside that sentence. A reader who stops after the first paragraph should retain the correct scope and uncertainty. An honest answer may be that the source does not support the comparison; say exactly what is missing rather than opening with a confident number and retracting it later.

Explain the decision or purpose, then the few claims that support the answer. For each numerical claim, give its denominator, units, baseline/window, evidence location and relevant limits. Link to supplied cells, query results, source excerpts, or calculation files. If a value requires a new derivation, calculate it explicitly with named operands and retain the calculation; otherwise ask the analyst for it. Mark estimates and assumptions as such.

Hold every sentence to [the rigor rules](references/rigor.md), above all the claims, rates, and changes sections: causal language only when the supplied design earns it, percentage points named as such, and no rate averaged across groups without its denominators.

## Give each claim its own section

Use one evidence-bearing claim per section. Its heading states what was learned, as a sentence the reader could repeat, rather than a label such as "Analysis." Put the answer-bearing claim first. Separate observed facts, interpretations, and recommendations. Keep an exploratory result from sounding pre-planned.

Use tables for comparisons that need exact lookup and charts for relationships that are easier to see. A picture is not mandatory behind every number in portable work. Chart titles, captions, and emphasis must tell the same story as the answer and its material caveat, including an inconclusive one. A whole-month increase must not visually stand in for an inconclusive weather-adjusted comparison.

## Use the reader's words

Replace jargon with the reader's words where the meaning survives. Explain a necessary term at first use. Keep the denominator beside every rate and the baseline and window beside any comparison someone might quote out of context. Preserve source references and exact values. Do not remove a caveat because it interrupts a cleaner story.

## Write a non-answer as an answer

"Not enough data," "inconclusive," and "the question needs reframing" are complete findings. Say the non-answer in the first clause, before the reason.

- **Not enough data:** the comparison is the right one, and the data cannot make it yet. State the gap: what exists, what is needed, and how far short it is. Say that this is not evidence the situation is fine.
- **Inconclusive:** the comparison ran and does not separate the options. Show it. Do not call the difference zero or the options equivalent. Name what would have separated them. When a test written in advance failed, name it and the observation that failed it.
- **Needs reframing:** the ask cannot be answered as posed. Say which part is unmeasurable, what the data does contain, and what a reframed question would need.

No number, threshold, or caveat is invented to fill the shape of an answer, and no causal verb appears in a finding that reached no answer.

## Check the draft before handing it over

Apply every criterion in [the narrative criteria](references/narrative-criteria.md) to every claim. Record a criterion that does not apply as not applying. `analysis-review` ships an identical copy for its Reader lens, so writer and reviewer judge against the same list.

When reshaping an existing draft, compare each revised claim with its source version. A change that alters population, window, exclusions, statistical certainty, causal strength, or which comparison supports the answer is substantive. Disclose it and return it for analytical review instead of making it silently.

Finish with what was checked, material limitations, and what observation or decision follows. Report who performed reviews and what remains unchecked only when that evidence exists. Never call the draft verified, approved, human-tested, or reader-tested merely because it is well written.
