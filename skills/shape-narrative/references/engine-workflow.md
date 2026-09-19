# Engine Finding mode

This reference applies only to an existing aftergrid Finding or an explicitly requested Engine workflow. It requires the complete aftergrid toolkit, including the CLI and contracts; portable use of the skill does not. Resolve repository paths below against that toolkit, not against the user's data directory.

# Shape the narrative

The Finding is written and its charts have settled. This pass decides what a Reader meets first, in what
order, and in whose words — and it changes nothing a Reader would count as a different meaning.

**What you may change:** the order of Claims in `claims[]` and of their Evidence subsections; the wording of
`claims[].sentence`, `population`, `comparison.description`, `exclusions`, `limitations`,
`material_caveat`; `charts[].title` and `description`; `tables[].title` and column labels; `finding.title`;
and the prose of `memo.md`. Then `content_digest`, because you changed content.

**What you read and leave alone:** every bound value and which token sits where; each Claim's `type`,
`numeric`, `comparison.kind` and `pre_registered`, `window`, `evidence`, `recheck`, `answer_bearing`;
`charts[].spec_path` and every file under `charts/`, `queries/`, `checks/`, `results/`, `inputs/`;
`reviews` and `attestations`.

A rewrite that changes what a Reader would conclude is not a rewrite. See **When a change is not a rewrite**
below.

## 1. Read for the Reader, not for yourself

Read `manifest.yaml`, `memo.md`, and the Reader profile named by `reader.profile` —
`<instance>/readers.md`, or `schema/generic-reader-profile.yaml` for `generic`.

**Done when** you can recite the profile's `will_misread` list, its `vocabulary.avoid` list, its
`time_budget_minutes` and what it `cares_about`.

## 2. Put the answer first

- **Answer** is the first section, and its first sentence answers the Question — including when the answer
  is that there is no answer. A Reader who reads that one sentence and stops has the point.
- The `<!-- material_caveat -->` block follows immediately, carrying the answer-bearing Claim's
  `material_caveat` verbatim. The caveat travels with the Answer; it never waits in a limitations list.
- `claims[]` opens with the answer-bearing Claim, and the Evidence subsections follow `claims[]` order,
  because the render lays them out in that order.
- **Decision it informs** comes next and names the decision, its owner and the options. A Reader who cannot
  tell what would change as a result of this Finding has been given a readout, not a Finding.

**Done when** Answer is the first section, its opening sentence carries the outcome, the caveat marker sits
inside that section, and the answer-bearing Claim is first in `claims[]`.

## 3. One Claim per subsection, stated in the heading

Each `### ` heading under **Evidence** is a Claim's `sentence`, verbatim with its tokens, followed by
`<!-- claim: <id> -->`. The heading is a sentence a Reader could repeat, not a label: "New users who saw the
checklist came back more often" rather than "Retention by arm."

Inside a numeric Claim's subsection: the figure marker first, then who is counted, then compared with what,
then what was left out, then the limits. A subsection that carries two ideas is two Claims or one Claim with
the second idea moved to its limitations.

**Done when** every Claim has exactly one subsection, every heading equals its `sentence`, and every
subsection holds one idea.

## 4. Make the chart title state the Claim

`charts[].title` states what the chart shows a Reader, with the values bound — not the axis, not the
measure name. `charts[].description` is what a Reader who cannot see the image is told, and it carries the
same numbers.

`tables[].title` states its Claim too, in words and with **no token in it**: a table caption is rendered
verbatim, so `{{ref:…}}` in a table title reaches the Reader as literal braces. The numbers are in the rows
underneath, so the title's job is to say what those rows show: "New users who saw the checklist came back
more often" rather than "Retention by arm" or "Who was counted, and how many came back."

A title that opens by naming the artifact ("Retention by arm"), by asking ("Who was counted"), or by
pointing back at something else ("The same comparison, phones and web separately") is a label. State the
Claim instead.

**Done when** every chart title reads as a claim with its values bound, every table title reads as a claim
with no token in it, and each chart description names the same values its title does.

## 5. Use the Reader's words

Read [`references/narrative-criteria.md`](narrative-criteria.md) and apply every criterion in it
to every Claim. It holds the judgments a linter cannot make — whether a word is earned, whether the caveat
is the one that matters, whether a sentence invites a misreading on the profile's list — and the Reader
reviewer in `/analysis-review` reads the same page.

**Done when** every criterion in that file has been applied to every Claim, no word on the profile's
`vocabulary.avoid` list survives outside a token, and each item on `will_misread` is either answered
somewhere in the memo or recorded as a non-blocking note for the Reader reviewer.

## 6. Re-pin, check, render

Re-pin `content_digest` with `digestOf` from `scripts/lib/validate-finding.mjs`, then:

```bash
aftergrid check <finding-dir>       # from a checkout: node src/cli.ts check <finding-dir>
aftergrid render <finding-dir>
```

A heading that no longer matches its Claim `sentence`, a caveat that no longer matches `material_caveat`, a
dropped marker and a stale digest are the four things this pass breaks. Fix them and re-pin.

**Three passes is the maximum.** After a third, hand back a `needs_attention` result naming the category,
the location and what you tried.

**Done when** `check` reports `evidence valid` with zero errors and `render` writes `render/finding.html`
without a warning.

## When a change is not a rewrite

Some requests read like wording and land as meaning. Each of these reopens review rather than being made
here; say which one it is and stop.

| The change | Why it is not wording |
| --- | --- |
| A verb that upgrades the Claim type — "was linked to" → "caused", "moved with" → "drove" | It asserts a design the Analysis did not have. `/write-finding` types Claims; changing the type invalidates method review. |
| Dropping or softening a `material_caveat`, an exclusion or a limitation | It changes what a Reader concludes while every digit stays the same. |
| Hiding which comparison was made, or presenting an exploratory cut as the pre-registered one | `comparison.pre_registered` is a fact about the Analysis. |
| Merging or splitting populations, re-aggregating, changing a window | It changes the number behind the sentence. Reopen the Analysis. |
| Truncating an axis, or any chart edit | Charts are `/iterate-visual`; a chart spec is not narrative. |
| Recording a review, an approval or "reviewed by" text | Attestations are a human's, and `check` reports an ungranted one as untrusted. |
