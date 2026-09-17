# Writing a non-answer

`insufficient_data`, `needs_reframing` and `inconclusive` are complete Findings. Each passes the template,
each carries Claims, and each is worth the Reader's five minutes. What they must not do is fill the shape of
an answer with something softer.

The temptation is always the same: a template has a slot, the slot wants a number or a falsifier, and there
isn't one. Leave the slot in the state the evidence supports and say who owns closing it.

## Which one

| Outcome | The Analysis found | `question.state` |
| --- | --- | --- |
| `insufficient_data` | The comparison is the right one; there is not enough data to make it yet. | `resolved` |
| `inconclusive` | The comparison was made and does not separate the options — **or the pre-registered falsifier fired**. | `resolved` |
| `needs_reframing` | The ask cannot be answered as posed: the quantity is not measured, the population cannot be identified, the window has no clean before. | `not_answerable`, with `unresolved` listing the parts |

`analysis.yaml#outcome_recommendation` picks one. Carry it across; never upgrade it because the evidence
looks suggestive.

## What each one says

### insufficient_data

The answer-bearing Claim is `descriptive` and states the gap with bound values: what exists, what the
minimum is, how far short. The `material_caveat` says, in so many words, that this is not evidence the
situation is fine — it is evidence that nobody can tell yet.

Say the earliest date the missing data could exist, taken from a saved result rather than from arithmetic in
your head, and say what else is still needed beyond that date. "Wait until Friday" is a promise; "the day
count is met once {{ref:…}} has closed, and an answer also needs {{ext:…}} cancellations and an approved
definition" is a fact.

A `minimum_data` Check that recorded `fail` is the business result here, not an engine failure. Say so in
**How we checked**, and keep the falsifier Check at `not_run` with its expected outcome recorded — running a
falsifier below its minimum-data gate produces a number nobody should read.

A second `numeric: false` Claim is often the honest one to add: the comparison that was deliberately not
made, and why. It states a method choice, so its `evidence` is empty and its `recheck.mode` is
`not_automatically_evaluable` with an owner.

### inconclusive

The comparison ran. Show it — the Claim is numeric, it has its chart or table, and the values are bound. The
sentence says the comparison does not separate the options; it does not say the difference is zero, and it
does not say the options are equivalent.

The `material_caveat` names what would have separated them: a larger population, a longer window, a
different measurement. If the Analysis recorded what size of difference the data could have detected, bind
it; if it did not, say the Analysis did not establish that rather than estimating it here.

The falsifier ran and its outcome is recorded, whatever it was. `check` only requires a falsifier outcome to
match its expectation when the outcome is `answered`, so an `inconclusive` Finding reports what happened.

#### When the falsifier is *why* it is inconclusive

This is the common shape, and it has its own discipline. The Analysis wrote down in advance what would show the
Answer wrong; that observation happened; the Finding says so. It is the system working, not a failure, and the
memo is written that way — never as an apology, never as a hedged version of the Answer that was hoped for.

The memo must carry all of this:

- **Answer**: the first clause says the Question is not settled by this Analysis. Then, in the Reader's words,
  what the falsifier asked, that it recorded `fail`, and the observation that made it fail. A Finding that says
  "inconclusive" without naming the contradicting observation has told the Reader nothing.
- **material_caveat**: names the falsifier too, because the caveat travels with the Answer everywhere it goes.
- **How we checked**: the falsifier among the Checks with its recorded outcome, and the sentence that it was
  not loosened, un-required or rewritten after its result was seen. Where `analysis.yaml#/checks_preregistered`
  pins its hash, say that a reviewer can verify it.
- **What would change our mind**: what would settle the Question instead — a longer window, a larger
  population, a Question reframed so that weekday and weekend (or whatever the falsifier split on) are asked
  separately and pre-registered separately. Not the fired falsifier restated as though it were still open.
- **Evidence**: the numbers stay. The evidence is valid; it is the Answer that does not stand. Claims the data
  do support are still made, still traced, still charted. `check` reports one `falsifier_failed` warning and no
  error, and `render` writes the page with the falsifier on it as its own fact.

The falsifier Check is `required: false`, as `/checked-analysis` writes it. A second falsifier written after the
first one fired is not a falsifier; a threshold moved to clear the result is the thing this outcome exists to
prevent.

### needs_reframing

There is no falsifier and there will not be one until the Question changes. `question.falsifier.kind` is
`not_evaluable` with a reason and an owner, and **What would change our mind** says exactly that: no test
can be written yet, here is what is missing, here is who owns deciding it. Writing an executable falsifier
for a Question nobody can answer is the failure this outcome exists to prevent.

The Claims describe what *is* known: which part of the ask is unmeasurable, what the data does contain, what
a reframed Question would need. Where a partial result exists, bind it; where none does, the Claim is
`numeric: false` with empty evidence. **Decision it informs** says the analysis cannot choose between the
options and names who decides what to do instead.

## The lines that hold for all three

- No number appears that is not in `results/`, a declared `derived` value or a typed `external_sources`
  entry — including inside a sentence about what is missing.
- No falsifier, threshold, definition, approval or caveat is invented to fill a slot.
- No causal verb. Nothing here established a cause; `caused`, `drove`, `led to`, `resulted in` and their
  relatives have no place in a Finding that reached no answer.
- The Answer sentence says the non-answer in the first clause. A Reader who stops after one line must not
  leave believing an answer was given.
- `finding.state` is `complete`. A non-answer is finished work, not a draft waiting to become one. Use
  `needs_input` only when a named human owes a named input.
