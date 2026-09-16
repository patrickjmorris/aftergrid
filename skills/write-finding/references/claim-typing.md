# Claim typing

Every Claim declares `descriptive`, `associational` or `causal`. The type is a statement about how the
comparison was built, not about how big or how convincing the number is. A Reader who meets an unearned
`causal` has been told something nobody established.

## The three types

| Type | What it asserts | What earns it |
| --- | --- | --- |
| `descriptive` | What a measured quantity is, for a stated population over a stated window. | The query ran on the declared population and window. Nothing else. |
| `associational` | Two things move together, or one group differs from another. | A comparison exists (`comparison.kind` is not `none`) and both sides are measured on the same definition, window and timezone. |
| `causal` | The intervention produced the difference. | Assignment to the groups was randomised, and the Analysis recorded that. |

In v0, randomised assignment is the **only** basis for `causal`. No sample size, effect size, time ordering,
regression, matching, difference-in-differences or set of controls promotes an `associational` Claim. A
design that argues for cause without randomisation may still be worth running; its Claim is `associational`
and its limitations say what would have to hold for the causal reading to be right.

`analysis.yaml` records `candidate_claims[].causal_basis`. When it says anything other than randomised
assignment, the Claim is `associational` or `descriptive`, whatever the draft sentence sounded like.

## Typing in four questions

Run them in order and stop at the first "no".

1. Does the Claim assert a number for one population over one window, with nothing compared? → `descriptive`.
2. Is something compared with something else? If not, it is `descriptive`, and the schema refuses
   `comparison.kind: none` on anything higher.
3. Were the two sides created by randomised assignment, recorded in `analysis.yaml`? If not →
   `associational`.
4. Both sides randomised, same definition version, same window, same timezone? → `causal`.

## Sentences that give the type away

The verb is where an unearned type usually enters. A Claim typed below `causal` describes; it does not
explain.

| Type | Sentences that fit | Verbs that overshoot it |
| --- | --- | --- |
| `descriptive` | "X of the accounts renewed in the window." "Only N days of data have accumulated." | rose *because*, improved *after we*, recovered *thanks to* |
| `associational` | "Accounts that did X renewed more often than accounts that did not." "The two groups differ by N." | caused, drove, led to, resulted in, produced, lifted, made |
| `causal` | "Accounts shown the new flow renewed more often than accounts shown the old one." | (still avoid "proves", "guarantees", "will") |

Two failures the word check will not catch, so look for them by hand:

- **A quantity spelled in words.** "doubled", "halved", "most" assert a measured number with no token behind
  it. Bind the value, or drop the word.
- **A causal claim smuggled into a caption or a title.** The chart title and the `material_caveat` are Claim
  text; type them the same way as the sentence.

## The material caveat carries the type

The answer-bearing Claim's `material_caveat` is where a Reader learns what the type buys them. Write it
against the Reader profile's `will_misread` list:

- `causal`: name the randomisation the conclusion rests on, and what a broken assignment would mean.
- `associational`: name the most plausible other explanation for the same pattern.
- `descriptive` on a non-answer: say plainly that the absence of a difference in the data is not evidence
  that no difference exists.

## Exploratory cuts

A split chosen after seeing the result is not the pre-registered comparison. Set
`comparison.pre_registered: false`, keep the type at `associational` or lower, and say in the limitations
that the cut was decided after the fact, so it is a lead to test rather than a settled fact. An exploratory
Claim never carries `answer_bearing: true`.
