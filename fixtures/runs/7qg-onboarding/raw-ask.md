# Raw ask and clarification rounds

Synthetic. The Operator is "Dana Okafor" at the fictional habit-tracking app in `fixtures/instance/`.
Recorded by hand, following `skills/grill-question/SKILL.md`. No model was in the loop.

## The raw ask, verbatim

> Did the onboarding checklist help new users come back?

Kept verbatim in `question.raw_ask`. Nothing about it is rejected for lacking a metric, a window or a falsifier;
that is what the rounds are for.

## What was already settled before round 1

Read from the Instance, not asked:

- `analytics/readers.md` names one Reader profile, `product_owner`. One profile, so it is the recommended answer,
  not a question.
- `analytics/definitions/retained_7d.md` is `lifecycle: approved`, version 2, grain user, window seven days from
  signup, analytical timezone America/New_York.
- `analytics/aftergrid.yaml` names the owner (Dana Okafor) and a DuckDB source.

## Round 1 — the decision, the metric, the population

❓ **Q1** — **What decision does this answer?** An Analysis with no decision behind it has no way to tell a
material caveat from an interesting aside.

➡️ Whether to keep the onboarding checklist for all new users, or remove it.

❓ **Q2** — **"Come back" — which measure?** The Instance has one approved definition that fits: `retained_7d` v2,
"opened the app on any of the seven days after signup", grain user, timezone America/New_York. The alternative
would be a new definition, which needs your approval before it can head a Claim.

➡️ `retained_7d` v2, as approved. No new definition needed.

❓ **Q3** — **Who is counted?** The checklist was assigned at random when people signed up. The population can be
everyone who signed up in the experiment window, or only the people the app can confirm actually saw the
checklist. There is no event recording that they saw it, so the second is not available.

➡️ Everyone who signed up inside the experiment window and was randomly assigned to one of the two onboardings.

**Answers given.** Decision: keep or remove the checklist. Metric: `retained_7d` v2. Population: randomly
assigned signups inside the window.

## Round 2 — the window and the primary comparison

❓ **Q4** — **Which window?** The assignment ran from the first of June to the twelfth of July. The last cohort
needs seven full days, which lands on the nineteenth of July.

➡️ Signups from 2026-06-01 to 2026-07-12 inclusive, New York time; coverage runs to 2026-07-19.

❓ **Q5** — **What is the primary comparison, before we look at any cut?** Pre-registering it is what keeps a
later slice from quietly becoming the headline.

➡️ 7-day retention of users assigned the checklist versus users assigned the old onboarding, over the whole
window, both arms together.

**Answers given.** Window: 2026-06-01 to 2026-07-12 New York, coverage to 2026-07-19. Primary comparison:
checklist arm versus control arm, whole window.

## Round 3 — the falsifier

❓ **Q6** — **What result would show the answer is wrong?** A falsifier has to be something a Check can evaluate
on the retained inputs. The experiment plan names a bar: the checklist earns its maintenance if it lifts 7-day
retention by at least 3 percentage points.

➡️ The Answer is wrong if the checklist arm's 7-day retention is not at least 3 percentage points above the
control arm's. The Check returns NULL — not evaluable — when either arm has fewer than 500 users, so a thin
experiment reports insufficient data rather than flipping the answer.

**Answer given.** Falsifier: a Check file with expected outcome `pass`, minimum 500 users per arm.

## Round 4 — vocabulary, and the one word that did not survive it

❓ **Q7** — **"Help" is a causal word.** `CONTEXT.md` requires every Claim to declare its type. A causal Claim is
earned here only because assignment was random. Confirm that assignment really was random, per user, inside the
window — if it was not, this becomes an associational Claim and the memo says so.

➡️ Randomised per user at signup, inside the window. The Claim is causal, and the memo says the comparison is
fair *because* the groups were assigned at random.

❓ **Q8** — **"New users" versus the glossary's Reader.** The Reader is `product_owner`; they will read "new
users" as "people who signed up recently", which is what the population says. No change needed.

➡️ Keep "new users" in Reader-facing text, and let the population field carry the precision.

**Frontier empty.** Every part of the Question is settled. Round 5 was not asked.

## What was written

- `manifest.question` with state `resolved` (see `clarified-question.yaml`).
- No new Metric definition: `retained_7d` v2 was approved and was used as it stood.
- One Diagnostic calculation was proposed later, during the analysis, for the exploratory platform split
  (`proposed-definitions/platform_group.md`). It is `lifecycle: proposed` and carries no approval block, and it
  backs an exploratory Claim only.
