# The three reviewer briefs

One brief per subagent. Each reviewer sees the Finding directory, `manifest.yaml`, `memo.md` and the resolved
Reader profile, and sees nothing from the other two.

Every reviewer returns exactly this, as the last line of its output, and nothing else:

```json
{ "blocking": ["…"], "non_blocking": ["…"] }
```

Each string is one plain sentence naming the thing and where it is (`c2`, `Answer`, `retention_by_arm`). An
empty `blocking` array is a normal result and the commonest one on a good Finding. A reviewer that has nothing
to say returns two empty arrays rather than inventing a concern.

Judge what is there. Where a Claim's evidence is thin, say so as a finding; do not compute a replacement
number, do not edit a file, and do not propose a rewrite of the memo.

---

## Method

You are reviewing statistical hygiene and whether the design earns what the Finding says.

Work through each of these against every Claim in `manifest.yaml` and its subsection in `memo.md`:

- **Claim type earned by design.** `causal` needs randomised assignment (the only basis v0 accepts; `candidate_claims[].causal_basis: randomised_assignment` in analysis.yaml), stated in the
  Finding; observational data supports `associational` at most; a single series supports `descriptive`. A
  `causal` Claim whose design is not stated is blocking.
- **Denominator and baseline.** Every rate names what it is a share of. Every comparison names what it is
  compared with, and the comparison's population is the same population or the difference is stated. A
  changed denominator between the two sides of a comparison is blocking whenever the Finding draws a
  conclusion from the change.
- **Population and window.** `population`, `window` and `exclusions` on each Claim match the SQL that produced
  its evidence. An exclusion applied in SQL and absent from the Claim is blocking.
- **Checks adequate to the Claims.** The Finding carries an `invariant` Check on the grain it counts, a
  `reconciliation` Check where a Claim cites an approved Metric definition, a `minimum_data` Check wherever the
  answer depends on having enough rows, and a `falsifier` Check when the Question is resolved. A Claim resting
  on a join that could duplicate rows, with no invariant on that grain, is blocking.
- **Diagnostic calculations labelled.** A number from a `diagnostic` definition, or from no definition, is not
  presented as an approved metric.
- **Small numbers and noise.** A difference the data cannot distinguish from noise is not written as a
  difference. Where `minimum_data` failed, the Finding says so rather than reporting the number anyway.

Not your job: wording, ordering, chart aesthetics, whether the Reader will like it.

---

## Question

You are reviewing whether this Finding answers the Question that was asked.

- **The ask and the answer.** Read `question.raw_ask`, then `question.decision`, `metric`, `population`,
  `window`. Then read the Answer sentence. An Answer about a different metric, population or window than the
  Question names is blocking.
- **Pre-registered comparison honoured.** `question.primary_comparison` is what the Analysis committed to
  before looking. A Finding whose Answer rests on a cut that is not the pre-registered comparison, without
  saying that the cut is exploratory, is blocking. An exploratory cut clearly labelled as exploratory is fine.
- **Outcome honest.** `finding.outcome` matches what the evidence supports: `answered` only where a Claim
  actually answers the Question; `insufficient_data` where a minimum was not met; `inconclusive` where the
  data cannot separate the possibilities; `needs_reframing` where the Question cannot be answered as asked.
  An `answered` Finding whose own Checks say the minimum was not met is blocking. So is an
  `insufficient_data` Finding that goes on to recommend an action anyway.
- **The falsifier.** A resolved Question carries a falsifier Check with an expected outcome. An unresolved or
  not-answerable Question lists what is missing. A falsifier invented to fill the field — one that could not
  fail, or that tests something other than the Question — is blocking.
- **What is still open.** Anything the Question asked for that the Finding does not address is a finding:
  blocking when the decision depends on it, non-blocking otherwise.

Not your job: the SQL, the chart, the prose style.

---

## Reader

You are the Reader named in `reader.profile`. Adopt that profile's `role`, `data_literacy`,
`time_budget_minutes` and `vocabulary`. Read the memo the way that person would: on the device in `reads_on`,
in the time in `time_budget_minutes`, without SQL.

Judge three things, in this order:

- **Understand.** After the Answer and its caveat, can you say what changed, for whom, over what period, and
  what it is being compared with? A Claim whose subsection does not say who is counted is blocking.
- **Inspect.** For any sentence, can you reach the calculation, the exclusions and the evidence behind it
  without asking anyone? A number with no way to see what produced it is blocking.
- **Continue.** Do you know what decision this informs, who owns it, and how to ask a follow-up? A Finding
  with no route back to the owner is blocking.

Then take each entry in the profile's `will_misread` in turn and find the place in this memo that invites it.
A memo that invites a listed misreading is blocking; name the sentence. Use the profile's `vocabulary.avoid`
list the same way: a term from it, unexplained, is blocking when the sentence cannot be understood without it.

Apply the narrative criteria you were given: `skills/shape-narrative/references/narrative-criteria.md` when it
exists, otherwise `references/reader-criteria.md` beside this file.

Not your job: whether the statistics are right, whether the SQL is right. Another reviewer has those.
