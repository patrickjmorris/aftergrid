# Raw ask and clarification rounds

Synthetic, recorded by hand following `skills/grill-question/SKILL.md`. No model was in the loop.
Golden Question: `fixtures/instance/analytics/golden/referral_campaign.yaml` (expected outcome: abstention).

## The raw ask, verbatim

> Do users who joined through the September referral campaign stick around better than other new users?

## What was already settled before round 1

- Reader: `product_owner`, the only profile in `analytics/readers.md`.
- `retained_7d` v2 is approved and fits "stick around": app opened on any of the seven days after signup,
  analytical timezone America/New_York.
- Coverage available in the Instance stops at 2026-09-14.

## Round 1 — the decision, the population, the comparison

❓ **Q1** — **What decision does this answer?**

➡️ Whether to run the referral campaign again next quarter.

❓ **Q2** — **Who counts as "joined through the referral campaign"?** The only signal in the data is a
`referral_signup` event on the user. There is no campaign id and no channel field that names the campaign.

➡️ Users with a `referral_signup` event whose signup falls inside the campaign period.

❓ **Q3** — **Compared with what?** Other new users in the same period is the fair comparison; other new users
across all time would mix seasons into the difference.

➡️ Users who signed up in the same period without a `referral_signup` event.

## Round 2 — the window, and a boundary that matters

❓ **Q4** — **Which September?** "September" is a calendar month, and the campaign is a marketing period. In
America/New_York these differ at both ends: a signup at 20:30 New York time on the thirty-first of August is
already the first of September in UTC.

➡️ The calendar month of September 2026, New York time. The campaign ran the whole month, so the two coincide.
Every date filter converts to New York time explicitly.

**Probe dispatched before round 3** (a fact, not a question for the Operator): how many users carry a
`referral_signup` event in that window, and how many of them have had seven full days by 2026-09-14?

## Round 3 — the falsifier, and where it stopped

Probe result: **12** referred users in September 2026, of whom **5** had not completed seven days by the
coverage date. Seven users with a mature seven-day window is not a population a retention rate can be read off.

❓ **Q5** — **What result would show the answer wrong?** A falsifier here would need a threshold on a difference
in retention between referred and non-referred users. On seven mature users, any threshold would be a number
invented to fill the field: the same data supports "much better" and "much worse" depending on one or two users.

➡️ **Do not write one.** The Question ends `unresolved` with `falsifier` in the `unresolved` list, and the
Analysis reports `insufficient_data`. When the campaign has enough referred users with a mature seven-day
window, the falsifier is the next round's first question, not this round's guess.

❓ **Q6** — **How many referred users would be enough?** This is the Operator's bar to set, and setting it after
seeing this month's numbers would be setting it to fit them.

➡️ Not answered in this session. Recorded as `needs_input` kind `clarification`, owner Dana Okafor, so the bar is
agreed before the next run rather than derived from the result it will judge.

**Frontier not empty, and that is the result.** Two branches stay open, both recorded. Neither was closed with a
recommended answer the data cannot support.

## What was written

- `manifest.question` with state `unresolved`, `unresolved: [falsifier]`, and **no** `falsifier` key.
- No new definition: `retained_7d` v2 was approved and was used as it stood.
- Two `needs_input` items in `analysis.yaml`, each naming its owner.
