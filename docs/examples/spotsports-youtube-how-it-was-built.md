---
title: How the sports YouTube deck was built
description: "How six aftergrid skills took one question from a raw view count to a 10-slide deck, what each one found, and what you can reuse on your own data."
kicker: Worked example · Process · Spot Sports data
---

You can get a first number from this data quickly: pull the view counts, compare September with July, and report the rise. That number doesn't tell you whether the rise is real, who it affects, or what anyone should do about it. [The deck](spotsports-youtube.md) tries to answer those questions, and this page shows how it got there.

The data is the public view counts for 535,168 videos from Spot Sports' catalog of 1,070 sports YouTube channels, read on 2026-10-27. 1,040 of the channels have an assigned sport, across 18 sports, and 746 channels in 14 sports met the analysis bar. On August 24, YouTube started counting a long-form view as soon as the video starts playing. My question was how much this moved our long-form numbers. If the answer was more than 25%, I would change how we rank and compare videos.

The skills ran in Claude Code, with AI reviewers on other models. Agents did the work, and I answered their questions and approved publication. Everything they wrote is in the repository.

## The first read compared with what shipped

| | First read | What shipped |
| --- | --- | --- |
| Question | "Views went up" | Per long-form video at 28 to 30 days old, against the same channel's earlier videos, judged against a 25% line |
| Before group | Videos published before August 24 | Only readings *taken* before August 24, because view counts are overwritten |
| Size | +37% (plain average, new against old videos) | +74% (60% to 94%), each channel against itself |
| Cause | "YouTube changed the count" | The count is the leading explanation. The season, Shorts, and placebos were tested, and the rise wasn't proven to be caused by the count |
| Action | "Views are inflated by about 1.74x, scale them down" | Tested and rejected. Report and price on each channel's own engaged views |

## 1. grill-question: make the question countable

This skill turned "how much did this move our numbers?" into a question with a unit, an age, a comparison, and my 25% threshold. It listed the readings it could take, such as total catalog views, a typical video, or a video against its own channel's history, which each give a different answer. It also recorded which choices I made and which ones it proposed itself.

It pointed out that catalog totals mix the counting change with catalog growth and with older videos still gaining views, so they can't tell you how much a view changed.

On your own data, write down the reader, the decision, and the number that would change it before you query. If two reasonable readings of the question fall on opposite sides of that number, settle that first.

## 2. explore-data: find out when each number was taken

This skill mapped grain, keys, coverage, and defects. Then it built a reading inventory that showed, for every stored view count, how old the video was and which side of August 24 the count was read on.

The table keeps only the latest view count, overwritten at each refresh, along with at most one earlier reading. A video published in July can carry a count read in September, partly under the new rule. The inventory found 13,618 long-form videos with a reading taken before the change at 28 to 30 days old, from 799 channels. The comparison uses the 13,254 of those videos that belong to the 746 channels with videos on both sides of the change. Without the inventory, the "before" group would have included views counted the new way, which understates the effect. It also found a stats refresh that stops updating Shorts at 14 days, which limits how Shorts can serve as a control.

When a measure can be overwritten, count your readings before you design a comparison, and decide before or after by when the number was read.

## 3. define-metric: compare each creator with themselves

This skill fixed the measure: views at 28 to 30 days old, with each channel's new videos compared against its own earlier videos. It wrote the definition as a proposal with a version number, because I haven't approved it.

A plain average of new against old videos gives +37%. One large channel posted 233 videos before the change and 10 after, which pulls the "before" group up. Matching each channel with itself gives +74%, and that's the number that fits the question.

When the mix of who's contributing shifts between periods, compare within the unit (channel, store, account) before you pool. I'd report the plain number next to the matched one so a reader can see why they differ.

## 4. diagnose-change: test the rival explanations

This skill sized the change and then tested the rival explanations it could name.

- **Placebos.** The same method run on periods with no counting change moves −15% to −3%, compared with +74% here.
- **The season.** The step lands in the same publish week for football (starting its season), baseball (finishing), and basketball and hockey (before the NBA and NHL openers). The full step starts with August 27 publishes. That's three days after the switch, and the data doesn't say why.
- **A control.** Shorts already counted views this way and didn't change. They didn't rise clearly in any sport.
- **Channels.** 88% of channels rose across the change, against 53% where nothing changed. Named channels ran from about 1.0x to 12.8x.
- **Sensitivity.** Across 19 re-cuts of long-form (weights, ages, windows, outliers), the rise stays between +46% and +85%.
- **Published estimates.** Agentio measured public against engaged views on more than 75,000 creator videos and published a figure of 1.67x overall in September 2026. Weighted to this catalog's mix of channel sizes, their figures give 1.74x, and this analysis gives 1.75x. The two studies measure different things, so the match supports the reading only if viewing held steady. I kept that cross-check on this page and out of the deck.

The skill didn't rule out the season, and it says so. Basketball includes the WNBA playoffs and hockey has training camps, so neither sport is free of in-season activity.

Try running your estimator on a period where nothing happened. If it moves as much there, you probably don't have a finding. Then write down the strongest rival explanation you couldn't rule out.

## 5. make-the-call: say what it means, and for whom

This skill tied the result to the decision and named each group the result moves: creators and clubs who report season numbers, and sponsors who pay per view. For each group it sized the change in their own terms, named a next step, and said what would reverse the call.

The tempting fix was to divide newer counts by 1.74. The skill tested that on the videos it would change, and it failed, because channels range from about 1.0x to 12.8x and a single factor misranks them. The deck tells each channel to use its own engaged views instead.

Before you recommend an adjustment, run it on the cases it would change. A fix that's right on average can be wrong for most of the units it touches.

## 6. analysis-review: have other models attack it

AI reviewers on three different model families (Claude Opus, GPT Sol, Gemini) reviewed the analysis over two rounds, looking at method, question fit, reader, and materiality. Each finding was rechecked against the data before anyone acted on it. Round one raised 15 findings, of which 13 were fixed and 2 partly fixed.

The reviews changed the analysis in these ways:

- The channel weights were rebalanced, which moved the headline from 1.77x to 1.74x.
- The weeks around the change are now kept out of the comparison.
- The single correction factor was rejected.

A red team then read the deck from the point of view of a measurement statistician, a sponsor's analytics lead, and a data executive. It raised 18 findings: 10 were fixed, 5 partly fixed, and 3 dismissed with reasons. The wording changed as a result:

- The new count is now called the leading explanation for the rise, and it isn't described as a proven cause.
- The old 30-second threshold is labeled as unpublished.
- The sponsor math became a stated scenario with ranges.

Give a reviewer the row-level data and the question, and leave your conclusion out. Record every finding and what you did about it, including the ones you dismissed.

## From analysis to deck

The analysis answered the question, but making a deck a sports channel could act on took more work.

The slides are written once, in [`content.mjs`](https://github.com/patrickjmorris/aftergrid/blob/main/examples/spotsports-youtube/scripts/content.mjs), and their numbers come from the saved result tables. The HTML deck, the PDF, and [the site page](spotsports-youtube.md) are all generated from that one file. A verifier checks the result tables against their hashes and checks that every slide's text appears in the HTML and PDF.

The first draft walked through the method in order, and I found it hard to follow, so the deck was rebuilt with the answer first. Slide 1 now says what to report and how to price, and the method moved to supporting slides and an appendix.

The second draft was a generic sponsorship read that could have come from anyone, so I asked for the sports angle. A new analysis step added sport-by-sport timing and channel-level spread. A second read-only pull of public titles added named channels and formats tagged from video titles. That changed the story to different sports calendars with the same week of rising public views.

Two AI models then graded the deck each round on three criteria: a clear takeaway, a clear impact, and sports specificity. Each round's fixes were checked against the results before they went in, and when the graders disagreed, the more cautious one won. The deck went through 35 rounds. These are AI grades, and no person has reviewed the deck.

The Agentio comparison and the review history were there to check the analysis, so they live on this page and in the repository, and I left them out of the deck.

## What the run changed in the skills

Running real data through the skills exposed gaps, and the fixes went back into the skills:

- **explore-data** now builds the reading inventory.
- **diagnose-change** now checks timestamps, runs the same estimator as a placebo, and compares against published estimates.
- **make-the-call** now tests an adjustment on the cases it would change, and names every group a result moves.
- **analysis-review** now checks the timing of the before group, gives reviewers row-level data, and doesn't let a review expand the question.

Those checks are in the skills you install.

## Run it on your own number

Pick a number that moved and a person who has to decide something because of it. Start with [grill-question](../skills/grill-question.md) and work down this page. A CSV, a SQL client, or a notebook is enough. The [quickstart](../guides/quickstart.md) has the install.

## Check it

- The analysis, code, and results: [`examples/spotsports-youtube/analysis/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis)
- Each skill's output: [`analysis/skill-outputs/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/skill-outputs)
- The reviews: [`analysis/reviews/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/reviews)
- The full run record, with models and dates: [`run-record.md`](https://github.com/patrickjmorris/aftergrid/blob/main/examples/spotsports-youtube/run-record.md)

`node examples/spotsports-youtube/scripts/verify.mjs` checks every result against its hash and every deck number against the results, without the private data. Rerunning the analysis from scratch needs the private extract.

AI agents did the analysis and AI models reviewed it. No person has approved it.
