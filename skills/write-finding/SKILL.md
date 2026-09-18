---
name: write-finding
description: "Turn analysis results into an evidence-linked answer for a specific reader, with scope and caveats beside the conclusion. Works with ordinary files and optionally an Engine Finding."
user-invocable: false
version: 0.1.0
---

# Write a finding

Use supplied results and analysis notes to answer the reader's question. A finding can be an ordinary memo, notebook summary, document, or message. No manifest or CLI is required. When writing an aftergrid Finding, use [the Engine procedure](references/engine-workflow.md) for its typed claims, bound values, and fixed artifact contract.

Read the question, results, assumptions, checks, and intended reader before writing. Establish which conclusions were actually reached and which remain exploratory. A writer may clarify a conclusion; it may not invent a new calculation, promote a proposed definition to approved, or turn a correlation into a cause.

## Make the first paragraph sufficient

State the answer, population, comparison and period in language the reader understands. Put the caveat that could change their decision beside that sentence. An honest answer may be that the source does not support the comparison; say exactly what is missing rather than opening with a confident number and retracting it later.

Explain the decision or purpose, then the few claims that support the answer. For each numerical claim, give its denominator, units, baseline/window, evidence location and relevant limits. Link to supplied cells, query results, source excerpts, or calculation files. If a value requires a new derivation, calculate it explicitly with named operands and retain the calculation; otherwise ask the analyst for it. Mark estimates and assumptions as such.

Use descriptive language for observed values, associational language for relationships, and causal language only when the supplied design earns it. Separate the direction of a change from whether its cause is known. Distinguish percentage points from percent change. Do not average rates across groups without accounting for their denominators.

Use tables for comparisons that need exact lookup and charts for relationships that are easier to see. A picture is not mandatory behind every number in portable work. A chart title must agree with the conclusion and its caveat, including inconclusive results.

Finish with what was checked, material limitations, and what observation or decision follows. Report who performed reviews and what remains unchecked only when that evidence exists. Never call the draft verified, approved, or human-tested merely because it is well written.
