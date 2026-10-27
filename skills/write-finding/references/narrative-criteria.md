# Narrative criteria

The judgments about an analytical memo's prose that no linter can make. `/write-finding` applies them while writing and reshaping. The Reader reviewer in `/analysis-review` applies the same list while reading, and reports where the memo fails one. Two audiences, one page, so a writer and a reviewer never work from different rules.

The criteria hold for any memo. Where an Engine Finding adds something, the criterion says so under **Engine Finding**. In portable work, "the reader" is the intended reader the user named; in an Engine Finding it is the Reader profile the manifest names.

For an Engine Finding, `check` already enforces the mechanical half: sections present and in order, one subsection per Claim, heading equal to the Claim sentence, the caveat marker in the Answer, every numeral bound. None of that is repeated here.

Apply every criterion to every claim. A criterion that does not apply is recorded as such, not skipped silently.

## 1. The answer is an answer

- The first sentence answers the question asked, in the reader's words, and is true of the evidence.
- A non-answer says so in the first clause. "We cannot tell yet" comes before the reason, never after it.
- It states what was found, not what was done: "New users who saw the checklist came back more often," not "We compared 7-day retention across arms."
- Reading the answer and the caveat alone leaves a reader with a conclusion they would not have to retract after reading the rest.

## 2. The caveat is the one that matters

- It is the caveat that would change the conclusion, not the most technically interesting one.
- It is legible to the reader: someone with no data training can tell what it rules out.
- On a causal claim it names the randomization the conclusion rests on. On an associational claim, the most plausible other explanation. On a non-answer, that the absence of a finding is not a finding of absence.
- It does not hide behind a hedge. "Results may vary" tells a reader nothing; name the thing that varies.

## 3. Every quantity word is earned

- "Doubled," "halved," "most," "nearly all," and "sharply" assert a measured quantity. Either a number in the evidence supports the word or the word goes.
- "Significant" is either a statistical result the analysis produced or it is deleted. In casual use it reads as "large" to a reader and as a test result to anyone else.
- A rounded number in prose matches the number the reader will see elsewhere in the memo.
- Direction words ("up," "better," "improved") name what they are relative to in the same sentence.

**Engine Finding:** the supporting number is a bound token. Display formatting is applied once at render, so a rounded number in prose matches what the render will display.

## 4. The comparison is visible

- The sentence says what the number is compared with. A rate with no denominator in sight is the most common misreading.
- An exploratory cut is labeled as decided after the fact, in the claim's own section, not only in a log or appendix.
- Where no comparison was made, the memo says so and says why, rather than leaving a bare number to be read against whatever the reader last saw.

**Engine Finding:** the label belongs in the Claim's subsection, not only in the manifest.

## 5. The population is a person, not a filter

- "Everyone who signed up in June and was randomly given one of the two onboardings" rather than "users where `signup_ts` between …".
- Exclusions are stated as who is left out and why, in the same voice.
- The count of who is counted is stated, so a reader can judge whether it is a lot or a few.

**Engine Finding:** that count is bound.

## 6. The reader's vocabulary

- No word the reader does not use carries a sentence they must understand.
- The reader's own words appear where they fit; a domain word the reader uses daily beats a precise word they do not.
- Sentences fit the time the reader has. One idea per sentence; the sentence a reader would quote comes first in its paragraph.
- Glossary terms may appear, but nothing requires the reader to know one.

**Engine Finding:** no word on the profile's `vocabulary.avoid` list survives outside a token or an id, the profile's `use` words appear where they fit, and sentences fit the profile's `time_budget_minutes`.

## 7. Each likely misreading is answered

List how this reader is likely to misread the memo, and point at the sentence that prevents each one. Common items and what answers them:

| Misreading | What answers it |
| --- | --- |
| Treats a correlation as a cause | Claim language that describes rather than explains, plus a caveat naming the design |
| Reads a rate without asking what it is a rate of | The denominator in the same sentence or the table beside it |
| Reads a small or immature sample as a trend | The population count, and a limitation saying how thin it is |
| Assumes a passed check means the conclusion is right | A **How we checked** passage stating what each check established and what it did not |

An item with no answering sentence is a finding: fix it if wording can, and record it as a non-blocking note for the reader review if it cannot.

**Engine Finding:** the list is the profile's `will_misread` list, and the Claim type in the render is part of what answers the correlation-as-cause item.

## 8. Every figure title states its claim

- A chart or table title is a sentence a reader could repeat, not a name for the artifact. "Who was counted, and how many came back" and "The same comparison, phones and web separately" label the thing; "New users who saw the checklist came back more often" states the claim.
- A title never asserts more than its claim does. A causal reading smuggled into a title is the same finding as one in the sentence.

**Engine Finding:** a chart title carries its values as bound tokens, and the render resolves them. A table title carries no token, because a table caption renders verbatim, so it states the Claim in words and lets the rows carry the numbers.

## 9. What happens next is clear

- The memo names the decision it informs, its owner, and the options.
- What would change our mind is in plain words and gives the earliest date a re-check means anything.
- Where a claim cannot be re-checked automatically, the memo says so and names who decides.
- The memo says what it is: a draft with no human approval recorded, if that is what it is.

**Engine Finding:** these live in **Decision it informs** and **What would change our mind**.

## Reporting

The writer fixes what wording can fix. A reviewer reports what it finds as `blocking` when a reader would reach a wrong conclusion, and `non_blocking` otherwise. "The wording invites the correlation-as-cause misreading this reader is prone to" is blocking; "the second limitation could be shorter" is not.
