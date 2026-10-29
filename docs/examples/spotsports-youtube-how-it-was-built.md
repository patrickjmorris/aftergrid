---
title: How the sports YouTube deck was built
description: "Six aftergrid skills took one real question from a raw view count to a 10-slide deck someone can act on. What each skill did, what it caught, and the move you can reuse on your own data."
kicker: Worked example · Process · Spot Sports data
---

Anyone with the data can get the number. Pull the view counts, compare September with July, report the rise. What the number doesn't tell you is whether it's real, who it affects, or what to do on Monday. [The deck](spotsports-youtube.md) gets from the number to a decision, and this page shows how.

The data is the public view counts for 535,168 videos from about 1,040 sports YouTube channels in Spot Sports' catalog, read on 2026-10-27. On August 24, YouTube started counting a long-form view as soon as the video starts playing. The owner's question was: *how much did this move our long-form numbers?* If the answer was more than 25%, they would change how they rank and compare videos.

Each skill below is listed with what it did here, what it caught, and the rule you can take to your own data. The skills ran in Claude Code, with AI reviewers on other models. Everything they wrote is in the repository.

## The fast read against the shipped read

| | Fast read | What shipped |
| --- | --- | --- |
| Question | "Views went up" | Per long-form video at 28 to 30 days old, against the same channel's earlier videos, judged against a 25% line |
| Before group | Videos published before August 24 | Only readings *taken* before August 24, because view counts are overwritten |
| Size | +37% (plain average, new against old videos) | +74% (60% to 94%), each channel against itself |
| Cause | "YouTube changed the count" | The count is the leading explanation. The season, Shorts, and placebos were tested, and the rise wasn't proven to be caused by the count |
| Action | "Views are inflated by about 1.74x, scale them down" | Tested and rejected. Report and price on each channel's own engaged views |

## 1. grill-question: make the question countable

**What it did.** It turned "how much did this move our numbers?" into a question with a unit, an age, a comparison, and the owner's 25% threshold. It listed the readings it could take, such as total catalog views, a typical video, or a video against its own channel's history. Each gives a different answer. It also recorded which choices the owner made and which ones it proposed itself.

**What it caught.** Catalog totals mix the counting change with catalog growth and older videos still gaining views. They answer "how big are our totals?" and not "how much did a view change?"

**Reuse it.** Before you query, write down the reader, the decision, and the number that would change it. If two reasonable readings of the question fall on opposite sides of that number, settle that first.

## 2. explore-data: find out when each number was taken

**What it did.** It mapped grain, keys, coverage, and defects. Then it built a reading inventory: for every stored view count, how old the video was and which side of August 24 the count was read on.

**What it caught.** The table keeps only the latest view count, overwritten at each refresh. A video published in July can carry a count read in September, partly under the new rule. The inventory found 29,175 clean month-old readings taken before the change. Without it, the "before" group would have included views counted the new way, which understates the effect. It also found a stats refresh that stops updating Shorts at 14 days, which limits how Shorts can serve as a control.

**Reuse it.** When the measure can be overwritten, count your readings before you design a comparison. Decide before or after by when the number was read, not by when the row was created.

## 3. define-metric: compare each creator with themselves

**What it did.** It fixed the measure: views at 28 to 30 days old, with each channel's new videos compared against its own earlier videos. It wrote the definition as a proposal with a version number, because the owner hasn't approved it.

**What it caught.** A plain average of new against old videos gives +37%. One large channel posted 233 videos before the change and 10 after, and drags the "before" group up. Matching each channel with itself gives +74%. The same data gives two answers, and only one fits the question.

**Reuse it.** When the mix of who's contributing shifts between periods, compare within the unit (channel, store, account) before you pool. Report the naive number next to the matched one so a reader sees why they differ.

## 4. diagnose-change: try to prove it wrong

**What it did.** It sized the change, then tested every rival explanation it could name.

- **Placebos.** The same method run on periods with no counting change moves −15% to −3%. Against that, +74% stands out.
- **The season.** The step lands in the same publish week for football (starting its season), baseball (finishing), and basketball and hockey (before the NBA and NHL openers). The full step starts with August 27 publishes. That's three days after the switch, and the data doesn't say why.
- **A control.** Shorts already counted views this way and didn't change. They didn't rise clearly in any sport.
- **Channels.** 88% of channels rose across the change, against 53% where nothing changed. Named channels ran from about 1.0x to 12.8x.
- **Sensitivity.** Across 21 variants (weights, ages, windows, outliers), the result stays well clear of no change.
- **Published estimates.** Agentio measured public against engaged views on 75,000 creator videos in September 2026 and found 1.67x overall. Weighted to this catalog's mix of channel sizes, their figures give 1.74x; this analysis gives 1.75x. The two studies measure different things, so the match supports the reading only if viewing held steady. That cross-check stays here and doesn't appear in the deck.

**What it caught.** It didn't rule out the season, and it says so. Basketball includes the WNBA playoffs and hockey has training camps, so neither sport is free of in-season activity.

**Reuse it.** Run your estimator on a period where nothing happened. If it moves as much there, you don't have a finding. Then name the strongest rival explanation you couldn't rule out, in writing.

## 5. make-the-call: say what it means, and for whom

**What it did.** It tied the result to the decision and named every group the result moves: creators and clubs who report season numbers, and sponsors who pay per view. For each group it sized the change in their own terms and named a next step. It also named what would reverse the call.

**What it caught.** The tempting fix was to divide newer counts by 1.74. The skill tested that fix on the videos it would change, and it failed: channels range from about 1.0x to 12.8x, so a single factor misranks them. The deck tells each channel to use its own engaged views instead.

**Reuse it.** Before you recommend an adjustment, run it on the cases it would change. A fix that's right on average can be wrong for most of the units it touches.

## 6. analysis-review: let reviewers who didn't write it attack it

**What it did.** AI reviewers on three different model families (Claude Opus, GPT Sol, Gemini) reviewed the analysis over two rounds, each with different lenses: method, question fit, reader, and materiality. Every finding was rechecked against the data before anyone acted on it. Round one raised 15 findings: 13 were fixed and 2 partly fixed.

**What it changed.**

- The channel weights were rebalanced, which moved the headline from 1.77x to 1.74x.
- The weeks around the change are now kept out of the comparison.
- The single correction factor was rejected.

A red team then read the deck as a measurement statistician, a sponsor's analytics lead, and a data executive. It raised 18 findings: 10 fixed, 5 partly fixed, and 3 dismissed with reasons. The wording changed:

- The rise is now called the new count's leading explanation, not a proven cause.
- The old 30-second threshold is labeled as unpublished.
- The sponsor math became a stated scenario with ranges.

**Reuse it.** Give a reviewer the row-level data and the question, not your conclusion. Record every finding and what you did about it, including the ones you dismissed.

## From analysis to deck

The analysis answered the question. Making a deck a sports channel would act on took more work.

**One source, every number read from results.** The slides are written once, in [`content.mjs`](https://github.com/patrickjmorris/aftergrid/blob/main/examples/spotsports-youtube/scripts/content.mjs). Its numbers come from the saved result tables, not from typing. The HTML deck, the PDF, and [the site page](spotsports-youtube.md) are all generated from that one file. A verifier checks the result tables against their hashes and checks that every slide's text appears in the HTML and PDF. Before it was trusted, the verifier was run on copies with deliberately wrong numbers to confirm it catches them.

**Lead with the decision.** The first draft walked through the method in order. The owner found it hard to follow, so the deck was rebuilt answer first. Slide 1 now says what to report and how to price, and the method moved to supporting slides and an appendix.

**Make it about the reader's world.** The second draft was a generic sponsorship read that could have come from anyone. The owner asked for the sports angle. A new analysis step added sport-by-sport timing and channel-level spread. A second read-only pull of public titles added named channels and formats tagged from video titles. That changed the story: different sports calendars, the same week of rising public views.

**Grade it until it holds up.** Two AI models graded the deck each round on three criteria: a clear takeaway, a clear impact, and sports specificity. Each round's fixes were checked against the results before they went in. When the graders disagreed, the more cautious one won. The deck went through 35 rounds. Several caught real errors before anyone outside saw them:

- the deck said "every format rose" when one didn't;
- a fee formula was missing a ÷ 1,000;
- the deck said league channels weren't measured, when they were.

These are AI grades, not a human review.

**Keep the evaluation out of the deck.** The Agentio comparison and the review history were there to check the analysis. They aren't the story, so they live on this page and in the repository.

## What the run taught the skills

Running real data through the skills exposed gaps, and the fixes went back into the skills:

- **explore-data** now builds the reading inventory.
- **diagnose-change** now checks timestamps, runs the same estimator as a placebo, and compares against published estimates.
- **make-the-call** now tests an adjustment on the cases it would change, and names every group a result moves.
- **analysis-review** now checks the timing of the before group, gives reviewers row-level data, and doesn't let a review expand the question.

Your next analysis starts with those checks already in place.

## Run it on your own number

Pick a number that moved and a person who has to decide something because of it. Start with [grill-question](../skills/grill-question.md) and work down this page. You don't need the Engine or a special setup: a CSV, a SQL client, or a notebook is enough. The [quickstart](../guides/quickstart.md) has the install.

## Check it

- The analysis, code, and results: [`examples/spotsports-youtube/analysis/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis)
- Each skill's output: [`analysis/skill-outputs/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/skill-outputs)
- The reviews: [`analysis/reviews/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/reviews)
- The full run record, with models and dates: [`run-record.md`](https://github.com/patrickjmorris/aftergrid/blob/main/examples/spotsports-youtube/run-record.md)

`node examples/spotsports-youtube/scripts/verify.mjs` checks every result against its hash and every deck number against the results, without the private data. Rerunning the analysis from scratch needs the private extract.

AI agents did the analysis and AI models reviewed it. No human has approved it.
