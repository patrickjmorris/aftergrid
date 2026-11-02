# write-finding

## What it does

Turns settled results into an answer someone can act on without reading SQL: the conclusion, who was counted, the comparison, the evidence, and the caveat that would change the decision, all in the first paragraph. It also reshapes a draft whose answer is buried. It puts the answer first, gives each claim its own section with a heading that states it, and rewrites toward the reader's words without changing what the evidence supports.

A writer may clarify a conclusion. It may not invent a calculation, promote a proposed definition to approved, or turn a correlation into a cause.

## When to reach for it

Ask in plain language. The agent reaches for it when numbers exist and the memo does not. Hidden from the Claude Code slash menu.

Reach for it after [analyze](analyze.md) or any run that produced inspectable results, or when a draft is right and still hard to use. Use [iterate-visual](iterate-visual.md) for the chart. Use [revise-finding](revise-finding.md) once feedback arrives.

## The first paragraph has to be enough

A reader who stops after the opening should retain the correct scope and uncertainty. Pair rates with denominators. Distinguish percentage points from percent change. Use descriptive language for observed values, associational language for relationships, and causal language only when the supplied design earns it. Those rules live in `references/rigor.md`, which several skills share. An honest answer may be that the source does not support the comparison, and "not enough data," "inconclusive," and "needs reframing" each have their own shape.

Every draft is checked against nine narrative criteria before it goes out: the answer is an answer, the caveat is the one that matters, every quantity word is earned, the comparison is visible, and so on. analysis-review ships an identical copy of that page for its Reader lens, so writer and reviewer judge against the same list.

## Common questions

**Does every number need a chart?** No. Portable work may use a table for a few exact values. A chart title must agree with the conclusion and its material caveat, including inconclusive results.

**Can it decide the outcome?** No. If the analysis recommended insufficient data, the memo says so in the first sentence.

**Where did shape-narrative go?** It is part of this skill now. Writing the answer and shaping its order and words were one step to the reader.

**Can it soften a discouraging caveat?** No. Dropping or hedging a material limitation changes the decision with every digit unchanged.

**Can it upgrade "associated with" to "caused"?** No. That asserts a design the analysis did not have.

**Can it reorder claims?** Yes, so the answer-bearing claim comes first, as long as each claim's evidence is unchanged.

**Does a well-written memo become verified?** No. Never call the draft approved, Engine-checked, or human-tested merely because it is clear.

## It's working if

- The first paragraph states the answer, population, comparison, period, and the decision-changing caveat.
- Material numbers point at supplied cells, query results, or retained calculations.
- Exploratory results do not sound pre-registered.
- Recommendations match the claim type the design supports.
- Headings are sentences a reader could repeat, and jargon the reader does not use is gone or explained at first use.
- A meaning-changing request came back as a report, with nothing edited.

## Where it fits

Model-invoked Explain-stage craft. Neighbors: [iterate-visual](iterate-visual.md) for the chart, [make-the-call](make-the-call.md) when the owner needs a recommendation, [analysis-review](analysis-review.md) before anyone acts.

If you use the optional command-line tool, [this page](engine/write-finding.md) covers how this skill works with it.
