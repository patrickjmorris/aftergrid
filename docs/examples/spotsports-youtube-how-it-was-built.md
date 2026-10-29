---
title: How the YouTube view-count analysis was built
description: The six aftergrid skills, in order, behind one real analysis, and what each one caught before it reached a slide.
kicker: Worked example · Process · Spot Sports data
---

Getting the number takes minutes now: pull the view counts, compare September with July, report the rise. The analysis behind [the deck](spotsports-youtube.md) took longer. Each skill below caught something the quick version would have shipped. The data is public view counts for about 1,040 sports channels from Spot Sports' catalog, 535,168 videos read on 2026-10-27.

## 1. grill-question: decide what "how much did it move?" means

The ask was "how much did YouTube's change move our long-form numbers?" That could mean the catalog total, a typical video, or a month-old video against its creator's earlier work. Each gives a different answer. The skill made the question countable: per long-form video, at a fixed age, against a threshold someone would act on.

## 2. explore-data: find when every reading was taken

View counts are overwritten as YouTube updates them, so one stored number can include views from before and after the change. The skill's reading inventory counted, for every stored reading, how old the video was and which side of August 24 the reading fell on. That found 29,175 clean month-old readings from before the change. A quick comparison would have used "before" videos read after the change, and understated the effect. It also found a stats refresh that stops updating Shorts at 14 days, which limited how Shorts could be used.

## 3. define-metric: compare each creator with themselves

The measure: views at 28 to 30 days old, each channel's new videos against its own earlier ones. A plain average of new against old videos gives +37%, because one large channel posted 233 videos before the change and 10 after. Matching each channel with itself gives +74%.

## 4. diagnose-change: try to prove it wrong

- **Placebos.** The same method on periods with no counting change gives −15% to −3%.
- **Shorts.** Shorts already counted the new way, and did not rise across the change.
- **Timing.** The step lands with videos published from late August, in the same week for football (starting its season), baseball (finishing), and basketball and hockey (before the NBA and NHL openers). The full step starts with August 27 publishes, three days after the switch, for unknown reasons.
- **Channels.** 88% of channels rose across the change, against 53% where nothing changed. Named channels ran from about 1.0x to 12.8x, mixing schedules with the count.
- **Sensitivity.** Across 21 variants (weights, ages, windows, outliers), the result stays well clear of no change.
- **Published work.** Agentio measured public against engaged views on 75,000 creator videos in September 2026: 1.67x overall, 1.85x for channels under 50k views a video, 1.49x over 300k. Matched to our mix of channel sizes, their figures give 1.74x; ours give 1.75x. The two measure different things: ours is before against after, theirs counts the same plays two ways. So agreement supports the reading only if viewing held steady and their ratios carry over. That cross-check stayed out of the deck and lives here.

## 5. make-the-call: say what it means for each group

The result moves two groups outside the platform: sponsors who price on views, and creators who pitch with them. For each, the skill sized the change in their own terms (cost per view of the old kind, and what to compare against) and named a next step. It also tested a tempting fix, scaling older counts by one factor. That fix failed on the videos it would change, so the deck does not recommend it.

## 6. analysis-review: let independent reviewers attack it

AI reviewers on three different models (Claude Opus, GPT Sol, Gemini) reviewed the analysis in rounds. Each round was followed by a revision. They:

- balanced the channel weights, which moved the headline from 1.77x to 1.74x;
- separated the weeks around the change;
- rejected the single multiplier.

A red team then read the deck as a measurement statistician, a sponsor's analytics lead, and a data executive. That changed the wording:

- the rise is the new count's leading explanation, not a proven cause;
- the 30-second threshold is labeled unpublished;
- the sponsor math became a stated scenario with ranges.

Every finding and response is recorded.

## 7. Making the deck sports-specific

The first deck was a generic sponsorship read. The owner asked for the sports angle. The analysis added sport-by-sport timing, channel-level spread, and, after a second read-only pull of titles, named channels and formats tagged from video titles. Two AI models then graded the deck each round on takeaway, impact, and sports specificity until both agreed it held up. Several rounds caught real errors: an overstated "every format rose", a fee formula missing a ÷ 1,000, and a claim that league channels were not measured when they were.

## Check it

- The analysis, code, and results: [`examples/spotsports-youtube/analysis/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis).
- Each skill's output: [`analysis/skill-outputs/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/skill-outputs).
- The reviews: [`analysis/reviews/`](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/reviews).

Every number in the deck is checked against the saved results by a script. Rerunning from scratch needs the private data extract. The analysis is agent-made and AI-reviewed, not human-approved.
