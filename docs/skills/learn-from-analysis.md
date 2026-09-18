# learn-from-analysis

Capture a non-obvious lesson from an actual analysis or correction, with evidence, applicability, counterexamples, and retrieval cues. Update project notes as proposals, never automatic approved definitions or universal memory.

## What it does

`learn-from-analysis` turns a demonstrated surprise into a compact, retrievable note: what was assumed, what was observed, what a future analyst should check, and when the lesson no longer applies.

The defining constraint: capture without retrieval is a diary. The note must change a later plan or check, and it stays **proposed** until a person promotes it.

## When to reach for it

Type `/learn-from-analysis`, or ask in plain language. Available for explicit use and automatic discovery.

Reach for it after a verified calculation, a failed approach that taught something durable, or a correction you would be embarrassed to repeat. Do not run it on a generic maxim, a session summary, or a plausible idea with no supporting observation. Use [plan-analysis](plan-analysis.md) on the next question to prove retrieval.

## Proposed, scoped, checkable

Search existing notes before adding a duplicate. Preserve disagreements and obsolete applicability instead of merging everything into one rule. Prefer a reusable assertion (uniqueness at a grain, numerator containment) when that fully captures the lesson; keep the reasoning that cannot be reduced to an assertion beside it.

A mix-shift lesson should tell the next analysis to check current weights, not assume every future decline is mix. A join lesson should name the grain to verify, not forbid joins.

The teaching sequence is the [conversion case](../examples/conversion-mix.md) followed by the [lesson-reuse follow-up](../examples/lesson-reuse.md).

## Common questions

**Does saving a lesson approve a metric?** No. A proposed note never becomes an approved definition or an Engine check without the separate owner process.

**Where does it write?** The user-designated project notes directory. If none exists, return the note in the response and, when saving is requested, choose a clear local path and say where. Do not write global agent memory.

**What if the evidence is thin?** Write a proposed question to test, or explain why no lesson is supported yet. Do not upgrade an agent’s self-report into a verified observation.

## It's working if

- The note cites the actual observation and artifact, not a reconstructed moral.
- Applicability and an invalidating condition are explicit.
- Status is proposed, with no invented owner or approval.
- A subsequent [plan-analysis](plan-analysis.md) can point to the note and name the check it added.

## Where it fits

An Improve-stage standalone; the Compound Engineering analog in this set. Capture here, retrieve in [plan-analysis](plan-analysis.md) and [analyze](analyze.md). The map is [ask-aftergrid](ask-aftergrid.md). See [Analysis that compounds](../fieldnotes/analysis-that-compounds.md).
