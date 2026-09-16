# Narrative criteria

The judgements about a Finding's prose that no linter can make. `/shape-narrative` applies them while
writing; the Reader reviewer in `/analysis-review` applies the same list while reading, and reports where
the memo fails one. Two audiences, one page, so a writer and a reviewer are never working from different
rules.

`check` already enforces the mechanical half — sections present and in order, one subsection per Claim,
heading equal to the Claim sentence, the caveat marker in the Answer, every numeral bound. None of that is
repeated here.

Apply every criterion to every Claim. A criterion that does not apply is recorded as such, not skipped
silently.

## 1. The Answer is an answer

- The first sentence answers the Question asked, in the Reader's words, and is true of the evidence.
- A non-answer says so in the first clause. "We cannot tell yet" before the reason, never after it.
- It states what was found, not what was done: "New users who saw the checklist came back more often", not
  "We compared 7-day retention across arms".
- Reading the Answer and the caveat alone leaves a Reader with a conclusion they would not have to retract
  after reading the rest.

## 2. The caveat is the one that matters

- It is the caveat that would change the conclusion, not the most technically interesting one.
- It is legible to the profile: a Reader with no data training can tell what it rules out.
- On a `causal` Claim it names the randomisation the conclusion rests on. On `associational`, the most
  plausible other explanation. On a non-answer, that the absence of a finding is not a finding of absence.
- It does not hide behind a hedge. "Results may vary" tells a Reader nothing; name the thing that varies.

## 3. Every quantity word is earned

- "doubled", "halved", "most", "nearly all", "sharply" assert a measured quantity. Either a bound token
  supports the word or the word goes.
- "significant" is either a bound statistical result the Analysis produced or it is deleted. In casual use
  it reads as "large" to a Reader and as a test result to anyone else.
- A rounded number in prose matches what the render will display, because display formatting is applied once
  at render.
- Direction words ("up", "better", "improved") name what they are relative to in the same sentence.

## 4. The comparison is visible

- The sentence says what the number is compared with. A rate with no denominator in sight is the misreading
  on almost every profile's list.
- An exploratory cut is labelled as decided after the fact, in the subsection, not only in the manifest.
- Where no comparison was made, the memo says so and says why, rather than leaving a bare number to be read
  against whatever the Reader last saw.

## 5. The population is a person, not a filter

- "Everyone who signed up in June and was randomly given one of the two onboardings" rather than "users
  where `signup_ts` between …".
- Exclusions are stated as who is left out and why, in the same voice.
- The count of who is counted is bound, so a Reader can judge whether it is a lot or a few.

## 6. The Reader's vocabulary

- No word on the profile's `vocabulary.avoid` list survives outside a token or an id.
- The profile's `use` words appear where they fit; a domain word the Reader uses daily beats a precise word
  they do not.
- Sentences fit the profile's `time_budget_minutes`. One idea per sentence; the sentence a Reader would
  quote comes first in its paragraph.
- Glossary terms may appear, but nothing requires the Reader to know one.

## 7. Each `will_misread` item is answered

For every item on the profile's `will_misread` list, point at the sentence that prevents it. Common items
and what answers them:

| Misreading | What answers it |
| --- | --- |
| Treats a correlation as a cause | The Claim type in the render, plus a caveat naming the design |
| Reads a rate without asking what it is a rate of | The denominator bound in the same sentence or the table beside it |
| Reads a small or immature sample as a trend | The population count bound, and a limitation saying how thin it is |
| Assumes a passed Check means the conclusion is right | **How we checked** stating what each Check established and what it did not |

An item with no answering sentence is a finding: fix it here if wording can, and record it as a non-blocking
note for the Reader reviewer if it cannot.

## 8. Every figure title states its Claim

- A chart or table title is a sentence a Reader could repeat, not a name for the artifact. "Who was counted,
  and how many came back" and "The same comparison, phones and web separately" label the thing; "New users
  who saw the checklist came back more often" states the Claim.
- A chart title carries its values as bound tokens, and the render resolves them.
- A table title carries no token — a table caption renders verbatim — so it states the Claim in words and
  lets the rows carry the numbers.
- A title never asserts more than its Claim does. A causal reading smuggled into a title is the same finding
  as one in the sentence.

## 9. What happens next is clear

- **Decision it informs** names the decision, its owner and the options.
- **What would change our mind** is in plain words and gives the earliest date a re-check means anything.
- Where a Claim cannot be re-checked automatically, it says so and names who decides.
- The Finding says what it is: a draft with no human approval recorded, if that is what it is.

## Reporting

`/shape-narrative` fixes what wording can fix. A reviewer reports what it finds as `blocking` when a Reader
would reach a wrong conclusion, and `non_blocking` otherwise. "The wording invites the correlation-as-cause
misreading on this profile's list" is blocking; "the second limitation could be shorter" is not.
