# shape-narrative

Make an analytical memo understandable: answer first, one claim at a time, explicit comparison, and the decisive caveat beside the answer. Preserve evidence and meaning.

## Portable use

Edit the supplied memo, document, notebook summary, or presentation text for its intended reader. No Engine artifact is needed. For an aftergrid Finding, use [the Engine workflow](../../skills/shape-narrative/references/engine-workflow.md) to preserve binding markers and review currency.

Read the question and evidence before polishing the prose. Identify the answer-bearing claim, who is counted, its baseline/window, and the caveat that would change what a reader does. If those are missing, name the gap rather than manufacturing them.

Put the answer first. A reader who stops after the first paragraph should retain the correct scope and uncertainty. Use one evidence-bearing claim per section, with a heading that states what was learned rather than a label such as “Analysis.” Separate observed facts, interpretations, and recommendations. Keep an exploratory result from sounding pre-planned.

Replace jargon with the reader's words where meaning survives. Explain necessary terms at first use. Pair rates with denominators; explain percentage points instead of silently swapping them for percent. Keep the baseline and time window with comparisons that might be quoted out of context.

Check that chart titles, captions, and emphasis tell the same story as the answer. A whole-month increase must not visually stand in for an inconclusive weather-adjusted comparison. Preserve source references and bound values. Do not remove a caveat merely because it interrupts a cleaner story.

After editing, compare each claim with its source version. If a change alters population, window, exclusions, statistical certainty, causal strength, or which comparison supports the answer, it is substantive: disclose it and return it for analytical review. Present the revised prose plus any unresolved evidence gaps, without claiming a reader study or approval.


Use the skill with the artifact or question you already have. It does not install the CLI, configure GitHub, or create an Instance unless you request Engine artifacts. The existing invocation policy is preserved.

## Engine Finding reference

The following documentation describes the optional Engine route, which retains its existing checks and approval requirements.


## What it does

`/shape-narrative` decides what a Reader meets first in a written Finding, and in whose words. It puts the
Answer and its material caveat at the top, makes each Evidence subsection one Claim whose heading states the
Claim, makes each chart and table title state the Claim rather than name an axis, and rewrites the prose
against the Finding's named Reader profile.

It is **model-invoked** (`user-invocable: false`, `policy.allow_implicit_invocation: true`), run inside
`/analyze` after `/write-finding` and `/iterate-visual` and before `/analysis-review`.

It changes wording and order. It changes no bound value, no Claim `type`, no `comparison`, `window`,
`evidence` or `recheck`, no chart spec and no file under `queries/`, `checks/`, `results/` or `inputs/`. A
request that would change what a Reader concludes is reported and stopped, not made: the skill's last
section lists the six shapes that takes.

The judgements it applies live in `skills/shape-narrative/references/narrative-criteria.md`. The Reader
reviewer in `/analysis-review` reads the same page, so writer and reviewer are never working from different
rules.

## When to reach for it

- A Finding is written and its charts have settled, and it has not been reviewed yet.
- A Reader review came back with wording findings that do not change a number or an interpretation.
- `/revise-finding` classified an Operator's request as presentation and handed the narrative half over.

Not for: writing a Finding that does not exist yet (`/write-finding`), chart work (`/iterate-visual`), any
change to a number or a query (that reopens the Analysis), or recording a review or an approval (a reviewer's
and a human's, respectively).

## Common questions

**Why is this separate from `/write-finding`?** Ordering and language are judged after the charts settle, and
they are judged against criteria a reviewer reads too. Keeping them separate means a chart change can be
followed by a narrative pass without rewriting the Claims, and means the Reader reviewer and the writer cite
one page rather than two.

**Can it reorder Claims?** Yes — `claims[]` order is what the render lays out, and the answer-bearing Claim
goes first. The Evidence subsections follow that order.

**Can it soften a caveat an Operator finds discouraging?** No. Dropping or softening a `material_caveat`, an
exclusion or a limitation changes what a Reader concludes with every digit unchanged. The skill reports it
and stops.

**Can it change "was linked to" into "caused"?** No. A verb that upgrades a Claim's type asserts a design the
Analysis did not have, and it invalidates method review. Claim types are `/write-finding`'s, earned by
randomised assignment.

**What does it do about a misreading it cannot fix with wording?** Records it as a non-blocking note for the
Reader reviewer, naming the `will_misread` item and the sentence that invites it.

## It's working if

- **Answer** is the first section, its first sentence carries the outcome, and the `<!-- material_caveat -->`
  block sits directly under it.
- Every Evidence heading is a sentence a Reader could repeat, identical to its Claim's `sentence`, and every
  subsection carries one idea.
- Every chart title states what the chart shows with its values bound, and every table title states its Claim
  in words with no token in it — a table caption renders verbatim — rather than naming a measure, asking a
  question or pointing back at another figure.
- No word on the Reader profile's `vocabulary.avoid` list survives outside a token, and every `will_misread`
  item is either answered by a sentence or recorded as a note.
- `aftergrid check` still reports `evidence valid` with zero errors after the pass, and the content digest was
  re-pinned.
- A meaning-changing request came back as a report naming which of the six shapes it was, with nothing edited.
