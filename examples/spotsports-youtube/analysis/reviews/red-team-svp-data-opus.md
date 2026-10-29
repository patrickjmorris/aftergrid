# Red team: Spot Sports YouTube deck (SVP Data persona)

## 1. First impression (60s)

Better than LinkedIn slop. Within-channel, age-matched comparison, placebos, an external benchmark, and a stated reversal threshold are real method. Most AI decks have none of these. But the cover oversells what the body shows ("overnight", "Nobody watched more"). The deck never names the obvious sports-calendar confound. And the recommendations are thin next to the method behind them. Net: a robust core number sold with a headline it doesn't earn and a payoff that doesn't land.

## 2. Three attacks I'd post in the comments

**A. Seasonality. Slides 2–4: "the rise is the counting rule."**
You picked the worst possible week for a sports catalog. The baseline is the World Cup summer (6/11–7/19). The post period is college football week 0, the US Open, European club kickoff, and the NFL run-up. Your "nothing changed" placebos (slide 4) are all summer-vs-summer, so they can't test a late-August seasonal step. And the full step starts with 8/27 publishes, not 8/24 (A3: 8/24–26 = 1.19x, 8/27–30 = 1.99x). The report says "cause unknown, not tested" (06-analysis-review.md:53). The deck hides this behind a "July 27 to August 26" band on slide 8 and never says why.

*Survives?* Mostly yes, but the deck doesn't make the case:
- Shorts from the same channels and sports didn't rise, so viewers' sports interest didn't surge.
- Basketball is off-season and still shows 1.90x.
- The typical-video lift is about 1.9–2.3x in almost every sport.
- Agentio measures public views against engaged views *on the same views*, which no seasonal effect can touch. Their 1.74 on our size mix vs our 1.75 leaves only about +1% (−8% to +12%) for real viewing change.

That is a strong rebuttal, and none of it is on a slide. The 2025 year-over-year check is weak (unequal ages) and was rightly dropped. The 3-day offset stays open, and the deck should say so.

**B. "Nobody watched more" / "never reached 30 seconds." Slides 1, 7.**
These are inferences presented as observations. The 43% is computed as 1 − 1/1.74, which assumes all of the lift is the rule. Slide 9 admits this ("assuming viewing would otherwise have stayed flat"). So slide 1 states as fact what slide 9 calls an assumption. "Overnight" is also wrong: this is a comparison across publish cohorts read at day 29, not a one-day jump in a counter. Slide 7 says "none reached a sponsor read after 30s," which is true by definition and reads as padding.

*Survives?* The number survives, because Agentio measures 40% directly. The wording doesn't. Fix it to "~4 in 10 counted views are plays under 30s (we estimate 43%; Agentio measured 40%)."

**C. The Agentio match is too good. Slide 5: "By channel size, the results match" (+85/+85, +79/+77, +49/+49).**
Matching to the percent on a 22-channel tier with a CI of 1.22–1.78 is luck, not validation. The tier definition was built after the Agentio numbers were in hand (04-diagnose-change.md:237–257). Other reasonable definitions move the 300k+ tier from 1.49 to 1.74. Re-weighting a vendor's headline 67% to "our mix" so it becomes 74% looks like moving the goalposts. Agentio also sells creator sponsorships, so its numbers aren't neutral.

*Survives?* The overall agreement survives (1.75 vs 1.74, and the re-weighting is principled: weights are shares of old-rule views). The tier-by-tier story does not. The report itself says "A size gradient in our data alone is not established" (04:272). Yet slide 6 says "Small channels gain the most" and slide 8 says "uneven by channel size, so no single correction fixes it." **That is the deck claiming something its own analysis rejects.** It's the most damaging finding here, because it supports the recommendation.

## 3. Filler, overclaims, jargon, eye-rolls

- "Every team has the numbers. Few know what to do when one moves." Generic thought-leader opener.
- "Nobody watched more" / "overnight" overclaim (above).
- Slide 10, "Independent reviewers challenge method…": the reviewers were other LLMs (opus, sol, gemini). Calling them "independent reviewers" without saying they were models is exactly what a skeptic will catch and screenshot.
- Slide 10, "Every number here reruns from saved code": not for the reader. The extract is private (README:22). Say "reruns with the private extract; result files and hashes are public."
- Slide 2: the "Spot Sports' +25% line" is never explained there. A reader has to get to slide 9 to learn it's the decision threshold.
- Slide 3: two headline numbers (+74%, +113%) with "every video counts equally, so small ones weigh more." Readers will ask which one to use. Pick one and put the other in the appendix.
- Slide 4: the title range "−15% to −3%" hides that one null (long-form within the new rule, 0.89, CI 0.81–0.97) is itself significant. A post-change downtrend exists and goes unmentioned.
- Slide 7: "57% of the old price per view keeps that cost where it was" is algebra, not insight.
- The deck never says what Spot Sports is or what its "top-1,000 list" drives (product, editorial, partner payouts). Without that, the 77% has no stakes.

## 4. Does the thesis land?

Half. The analysis turns a number into a *correct* number. It doesn't turn it into a decision anyone pays for:
- The creator and sponsor advice ("use engaged views") is what Agentio, Podtrac, and every creator newsletter said in early September. Nothing here adds to it.
- The only Spot Sports-specific action is "trial a ranking… confirm the cost first." That's vague and has no owner, no dollar figure, and no cost of doing nothing.
- The strongest decision content, slide 9's pre-committed reversal criteria, is good and rare. It's undersold.

To land harder: name one decision, one owner, and the money at stake. For example: "Partner payouts / sponsor rate card keyed to raw views overpay by X% on post-8/24 inventory = $Y/quarter. Switch to within-cohort percentile on 12/1 unless the November recheck comes in under +25%." Then show what the naive read would have cost: naive pooled is +37%, matched is +74%. Two wrong answers in opposite directions is the "data ≠ decision" story, and it's sitting unused in decomposition_channel_mix.csv.

## 5. Top 5 fixes, ranked

1. **Remove the channel-size gradient claim** from slides 6 and 8 ("small channels gain the most", "uneven by size, so no single correction"). The analysis says the gradient is not established. Rebuild the recommendation's "why" on cohort timing instead.
2. **Add a seasonality slide** (or fold it into 4). Name World Cup baseline vs football kickoff. Rebut it with the Shorts control from the same channels, the off-season basketball lift, the uniform typical-video lift across sports, and Agentio's same-view ratio. Disclose the unexplained 8/27 step start.
3. **Rewrite the cover and slide 7 as estimates.** Drop "overnight"; replace "Nobody watched more" with "~4 in 10 'views' are now sub-30s plays." Say "we estimate" vs "Agentio measured."
4. **Make one decision concrete.** Spot Sports owner, what the ranking feeds, the dollar or exposure misallocation, the go date, and slide 9's reversal test as the kill switch. Show naive +37% vs matched +74% as what the data alone would have gotten wrong.
5. **Fix the trust claims on slide 10 and 5.** Label the reviewers as AI models, scope "reruns" to the private extract, and on slide 5 show the tier sensitivity (300k+ moves 1.49–1.74) instead of "results match," or show only the overall 1.75 vs 1.74.
