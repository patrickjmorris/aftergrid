---
title: "Sports YouTube’s fall 2026 will look like a record season. The new view count is the leading reason"
description: "Real data from 746 sports creator channels across 14 sports. Same creators, same video age: long-form views rose 74% after YouTube changed how it counts a view, in the same weeks the football and soccer seasons began. What it means for creators, clubs, leagues, and sponsors."
kicker: "Analysis · Real data · Sports YouTube"
---

An analysis on real data: the public view counts of about 900 sports creator channels, from Spot Sports' catalog. The owner approved publishing these metrics. Nothing here identifies a viewer. The analysis is agent-made and AI-reviewed, not human-approved. [How it was built](spotsports-youtube-how-it-was-built.md).

This page and the [deck](https://github.com/patrickjmorris/aftergrid/blob/main/examples/spotsports-youtube/deck/spotsports-youtube-case-study.pdf) are generated from the same source. Every number traces to a [saved result](https://github.com/patrickjmorris/aftergrid/tree/main/examples/spotsports-youtube/analysis/results).

## 1. Report sports performance and price sponsorships on engaged views.

- **Measured:** Across 746 sports channels, long-form videos published August 31 to September 29 had 74% more first-month public views per video (+60% to +94%) than the same channels’ summer videos. Some of that may be real growth.
- **Season or count?:** Basketball and hockey rose alongside football and soccer before the NBA and NHL openers: imperfect checks, since basketball includes the WNBA playoffs and hockey training camps. No sport showed a clear Shorts rise.
- **Not measured:** Engaged views, the old count. Each channel sees them in YouTube Studio; this analysis could not.

- Monday, reporting: compare first-30-day engaged views at matching competition stages with 2025; label public views separately (slide 7).
- Monday, sponsorships: for your 10 most recent sponsored long-form videos since August 24 now 30 days old, divide total engaged by total public views; use that share with an agreed engaged CPM (slide 8).

## 2. On August 24 YouTube changed what a view is, at the start of the busiest stretch of the sports calendar

- **Before** A view needed a viewer to keep watching. YouTube never published how long. That count is now called “engaged views” and is available in the creator’s YouTube Studio and through authorized channel reporting.
- **After** A view counts when the video starts. Any play counts, including a few seconds of autoplay in a feed. Shorts already counted this way. Counts from before August 24 were not restated.
- **Kickoff** Bad timing for sports. The American football and European soccer seasons were starting. Fall is when sports channels report season starts against last year, so a counting change is easy to read as a great start. Last year these weeks showed no long-form rise, a weak check (appendix A15).

## 3. Different sports calendars, the same week of rising public views

Each line is one sport’s new long-form videos by publish week, read at one month old, against the same channels’ videos from before the change.

**Could it be the season?:** Football starting, baseball nearing the postseason, NBA and NHL openers still ahead, yet all four rose the same week. Basketball includes the WNBA playoffs and hockey training camps, so neither is a season-free control. That supports, but does not isolate or size, a counting contribution.

| Publish week | Football |
| --- | --- |
| 7/13 | −8% |
| 7/20 | +7% |
| 7/27 | −6% |
| 8/3 | +4% |
| 8/17 | +29% |
| 8/24 | +80% |
| 8/31 | +134% |
| 9/7 | +122% |
| 9/14 | +121% |
| 9/21 | +125% |

Change in views per video against each channel’s earlier videos; late July to mid-August publishes straddle the change, and the thin August 10 week is left out. End labels pool every week since the change, as on slide 5. Soccer and all sports: appendix A3 and A4. Source: `sport_event_study.csv`.

## 4. Same sports, same weeks: long-form rose in all eight. Shorts, whose counting did not change, rose clearly in none

On the typical video, long-form rose +87% to +135% in all eight sports. Shorts, counted the same way before and after, ran −29% to +17%.  Shorts are a different format, read at 12 to 14 days, so this weighs against a season-wide surge without ruling one out. Shorts fell on the typical video (0.91x, 0.84x to 0.99x); if viewers moved from Shorts to long-form, part of the long-form rise is real viewing, which this analysis cannot separate.

| Group | Long-form, one month old | Shorts, two weeks old |
| --- | --- | --- |
| Soccer | +131% | −4% |
| Football | +135% | −29% |
| Basketball | +112% | +17% |
| Baseball | +97% | −21% |
| Hockey | +94% | −16% |
| Golf | +87% | −26% |
| Tennis | +87% | −8% |
| Running | +101% | +4% |

Typical video (geometric mean), so one big channel cannot dominate; slides 3 and 5 use views per video, so football reads +135% here and +112% there. Bar height is views after ÷ before for the same channels; labels show the change, and lines the range from channel sampling. Sports with at least 20 Shorts channels. Source: `lift_by_segment.csv`.

## 5. Every sport’s typical video rose; on views per video, running and cycling are within noise. Do not sell any one as the biggest gainer

Long-form views at one month old, each sport’s channels against their own earlier videos. Soccer ran above its own baseline in July, during the World Cup, and spiked again in the Sept 7 week, so do not read its +114% as counting alone (appendix A3). Between seasons, 97% of hockey channels rose, against about 50% in a smaller no-change sample (A6). Named channels ran from 1.00x (Manchester United, range 0.43x to 2.66x) to 12.76x (ESPN College Football, whose summer had no games): price each creator on their own engaged share (A7).

| Comparison | After ÷ before |
| --- | --- |
| Soccer | +114% |
| Basketball | +90% |
| Baseball | +56% |
| Running | +47% |
| Hockey | +80% |
| Golf | +34% |
| Football | +112% |
| Tennis | +44% |
| General Sports | +56% |
| Rugby | +81% |
| Cricket | +67% |
| Cycling | +18% |
| Fantasy Sports | +104% |
| Swimming | +154% |

On the typical video all 14 sports rose, 1.39x to 2.35x (A16). Sorted by number of channels, largest first. Bar height is views after ÷ before; labels show the change, and lines the range from channel sampling. Channels per sport range from 14 to 171. Source: `lift_by_segment.csv`.

## 6. Cross-season public-view records mix two counts. Post-change videos are overrepresented in this sample’s top 1,000

- **+74%** New videos vs the same creators’ summer videos. A new video’s first month runs far above the same creator’s earlier videos. Any recap that compares this fall with last fall on public views mixes two counts.
- **77%** Of the top 1,000 videos. Among long-form videos published May 8 to July 26 or August 31 to September 29, each at one month old, those after the change are 64% of uploads but 77% of the 1,000 most viewed. A uniform 1.74x adjustment cuts their share to 61%: a sensitivity to counting, not a measured correction. The windows also differ by season, summer against early fall, so part of the gap may be season.
- **No blanket correction** The 74% rise is not a discount for your whole channel. Older videos contain views counted under different rules, and this study does not measure engaged views. For Monday’s report, show first-30-day engaged views against matching competition stages in 2025, and label public views separately. Lifetime-total scenarios are in appendix A18.

## 7. For sports creators, clubs, and leagues: report the season on engaged views, and label every count

Measured on 746 sports channels, including league and club channels, which ranged from no clear change (NBA, Manchester United) to 9.11x (Major League Soccer, whose summer baseline overlapped the World Cup) (appendix A7).  Shorts already used the new rule, so keep long-form and Shorts separate and measure your own gap before estimating a whole-channel effect. Compare engaged views with matching 2025 weeks and competition stages; show public views only beside engaged views, both labeled.

1. **Season recaps by sport.** Report line: “[stage, format]: X first-30-day engaged views, Y% vs the matching 2025 stage; public views Z, new count.” Football: weeks 1 to 4. MLB: same postseason rounds. Soccer: match stages; July’s World Cup is a different baseline. NBA and NHL: openers pending until day 30.
2. **Rate cards and media kits.** Name the count behind every number. New videos average 1.74x the public views of the same channels’ summer videos (1.60x to 1.94x), including any real growth. Among the 480 channels with five or more videos on each side, about 22% moved less than 1.25x and 11% more than 4x: observed changes, not measured counting effects (appendix A5). Before a sponsor asks, put your own day-30 public and engaged views side by side, and quote engaged first.
3. **Records and rankings.** Label records set after August 24 as records under the new count. Football’s opening weeks and the October NBA and NHL openers use a different count from 2025; before claiming a cross-season record, compare engaged views at the same video age.

## 8. Selling sponsorships: agree a CPM per 1,000 engaged views; convert public-view requests with each creator’s measured engaged share

- **Fee = views × share ÷ 1,000 × CPM** Public views × engaged share ÷ 1,000 × engaged-view CPM; e.g. 1,000,000 × 70% ÷ 1,000 × $30 = $21,000. Engaged share is each creator’s day-30 engaged ÷ public views in YouTube Studio; this study could not see it. Keep an existing engaged-view rate; agree metric and rate before renewing a public-view contract. For a guarantee, agree an engaged-view target and reconcile against actual engaged views.
- **$21,000** Hypothetical 70% engaged share: 1 million public views hold 700,000 engaged views. Paying $30,000 means a $42.86 engaged-view CPM; at an agreed $30, the fee is $21,000, $9,000 less. The 70% share is hypothetical; substitute the creator’s measured share.

Do not use 1 ÷ 1.74 to price a creator. Your engaged share: take your 10 most recent sponsored long-form videos published since August 24 that have reached day 30, and divide total engaged by total public views over each one’s first 30 days; disclose a smaller sample, and report Shorts separately. Football and soccer: base guarantees on comparable competition stages. NBA and NHL: mark opener guarantees provisional and rebase in late November, when October videos reach day 30 (A2). Packages: long-form and Shorts separately; the 74% is long-form only.

## 9. What would change this read, and when to look

- **Late November 2026.** October videos, published as the NBA and NHL seasons start, reach one month old. Recheck the rise, and ask creators for public and engaged counts on the same videos. So far the Sept 7 week spiked to +106%, led by soccer (appendix A3); the Sept 21 week, at +64%, is back near the Aug 31 week (+67%), and videos from Sept 14 on run 11% below the first two post-change weeks (appendix A15).
- **What would settle it.** What would settle it: public and engaged views on the same videos from a representative set of sports creators, matched by age. What we have: 19 re-cuts of public views all show a rise (+46% to +85%, appendix A17); none of them sees engaged views. Unexplained: the full step starts with videos published August 27, not August 24 (appendix A14).
- **The assumption.** The evidence points to counting, but we cannot yet split the rise between counting and real viewing growth. The 74% rise cannot tell a creator’s engaged share or sponsorship discount: request public and engaged counts on the same sponsored videos, and agree the engaged-view CPM separately. Last year’s same weeks, the only long-form check that spans a season start, showed no rise (0.88x, 0.72x to 1.10x), though video ages differ widely (appendix A15).

## 10. Sports YouTube is our beat. Have a number that moved? Sporting Works turns it into a decision

Built on Spot Sports’ catalog of about 1,040 sports creator channels in 18 sports (746 channels in 14 sports met the analysis bar), by Patrick Morris at Sporting Works with aftergrid, open-source analytics skills for the AI agent your team already uses.

1. **Season reporting.** Season-over-season views, records, and rankings that hold up when the count changes.
2. **Sponsor-ready numbers.** Rate cards and sponsor reports built on engaged views, by sport and channel size.
3. **The workflow.** The same skills set up in your team’s agent, so the next analysis starts here.

[Email Patrick](mailto:patrickjohnmorris@gmail.com?subject=Sporting%20Works%20analysis) · [aftergrid on GitHub](https://github.com/patrickjmorris/aftergrid) · [How this analysis was built](https://github.com/patrickjmorris/aftergrid/blob/main/docs/examples/spotsports-youtube-how-it-was-built.md)

## Appendix: sport and channel detail

### A1. Soccer and basketball hold 36% of long-form views; football’s 62 channels draw as much as baseball’s 96

| Sport | Channels | Videos | Long-form share | Median long-form length | Share of long-form views |
| --- | --- | --- | --- | --- | --- |
| Soccer | 209 | 112,291 | 52% | 10 min | 20.6% |
| Basketball | 119 | 76,650 | 50% | 14 min | 15.4% |
| Running | 117 | 19,963 | 63% | 12 min | 2.6% |
| Baseball | 96 | 50,613 | 54% | 13 min | 8.8% |
| Hockey | 94 | 40,588 | 55% | 10 min | 2.1% |
| Golf | 79 | 15,826 | 49% | 17 min | 6.5% |
| Football | 62 | 47,135 | 61% | 16 min | 8.8% |
| Rugby | 47 | 11,389 | 46% | 26 min | 0.6% |
| General Sports | 38 | 84,353 | 48% | 10 min | 15.7% |
| Tennis | 36 | 25,558 | 55% | 8 min | 5.4% |
| Cricket | 29 | 7,701 | 53% | 18 min | 4.6% |
| Swimming | 28 | 5,589 | 42% | 11 min | 0.2% |
| Fantasy Sports | 21 | 5,545 | 78% | 52 min | 0.2% |
| Cycling | 20 | 11,390 | 39% | 9 min | 2.4% |
| Volleyball | 19 | 3,854 | 83% | 13 min | 1.7% |
| Lacrosse | 12 | 2,614 | 37% | 18 min | 0.0% |
| Motorsports | 9 | 4,546 | 29% | 23 min | 1.6% |
| Combat | 5 | 8,418 | 28% | 13 min | 2.8% |

Each channel is assigned its most common sport. Views are stored public counts at the last reading, all ages. Sports with fewer than 10 analyzable channels (volleyball, lacrosse, motorsports, combat) are not in slides 3 to 9. Source: `sport_catalog.csv`.

### A2. Where each sport stood when the count changed, how much it rose, and the first fair comparison with 2025

| Sport | August 24 to September 21 | Rise, views per video | First like-for-like comparison with 2025, on engaged views |
| --- | --- | --- | --- |
| Football | Season starting: college kickoff, then the NFL | +112% | Weeks 1 to 4 of each season, same video age |
| Basketball | NBA between seasons; WNBA playoffs | +90% | October openers against last October’s |
| Hockey | NHL between seasons; training camps | +80% | October openers against last October’s |
| Baseball | Final month of the regular season | +56% | Postseason rounds against last year’s same rounds |
| Soccer | European leagues starting; summer was World Cup season | +114% | Same competition stage, not July |
| All sports | Shorts counting unchanged | +74% | Long-form only; ask for Shorts separately |

Calendar positions are general knowledge, not data in this extract. Compare first-30-day engaged views from YouTube Studio, not public views. Source: `sports calendar; lift_by_segment.csv`.

### A3. The weekly rise in the five largest sports

Soccer was already above its baseline in July, during the World Cup’s final weeks: do not read its full +114% pooled rise as counting, or use it as a soccer pricing discount. Football’s season start coincides with the change; basketball and hockey avoid the NBA and NHL regular-season starts, but other calendar changes remain possible contributors.

| Publish week | Soccer | Football | Baseball | Basketball | Hockey |
| --- | --- | --- | --- | --- | --- |
| 7/13 | +17% | −8% | −13% | −32% | +44% |
| 7/20 | +46% | +7% | −6% | −6% | −14% |
| 7/27 | +6% | −6% | −4% | −31% | −16% |
| 8/3 | +53% | +4% | +8% | −14% | −31% |
| 8/17 | +44% | +29% | +4% | +20% | −24% |
| 8/24 | +109% | +80% | +62% | +112% | +49% |
| 8/31 | +109% | +134% | +51% | +124% | +96% |
| 9/7 | +175% | +122% | +81% | +110% | +76% |
| 9/14 | +107% | +121% | +56% | +95% | +78% |
| 9/21 | +83% | +125% | +47% | +90% | +77% |

Views per video at one month old against each channel’s pre-change level. The thin August 10 week is left out. Source: `sport_event_study.csv`.

### A4. The weekly rise, all sports

| Publish week | Long-form |
| --- | --- |
| 6/15 | −1% |
| 6/22 | −2% |
| 6/29 | +13% |
| 7/6 | −6% |
| 7/13 | −3% |
| 7/20 | −2% |
| 7/27 | +1% |
| 8/3 | +1% |
| 8/10 | +36% |
| 8/17 | +7% |
| 8/24 | +66% |
| 8/31 | +67% |
| 9/7 | +106% |
| 9/14 | +76% |
| 9/21 | +64% |

Weeks before 7/20 were read before the change; 23% of the 7/20 week was read just after it; 7/27 to 8/17 straddle it. Source: `event_study.csv`.

### A5. Channel by channel: how much each channel’s new videos changed

One ratio per channel with at least 5 videos on each side: 480 channels across the change. Where nothing changed, channels center on no change; across the change, most moved up.

| Group | Across the change | Where nothing changed |
| --- | --- | --- |
| under 0.5x | 1% | 11% |
| 0.5x to 0.8x | 5% | 19% |
| 0.8x to 1.25x | 16% | 32% |
| 1.25x to 2x | 35% | 22% |
| 2x to 4x | 31% | 12% |
| 4x or more | 11% | 4% |

Share of channels in each band of mean views per new video over mean views per earlier video, at 28 to 30 days. Where nothing changed: published before vs after July 1, all read before August 24. Source: `channel_lift_distribution.csv`.

### A6. Between seasons, 97% of hockey channels and 79% of basketball channels rose. Football’s 100% coincides with kickoff

Share of channels whose new videos rose, across the change against a period where nothing changed. Audit season reports across every channel, not just a few breakouts. This shows breadth, not each channel’s counting effect. Football: 35 of 49 analyzed channels had 5 or more videos on each side.

| Group | Across the change | Where nothing changed |
| --- | --- | --- |
| All sports | 88% | 53% |
| Soccer | 86% | 72% |
| Basketball | 79% | 29% |
| Baseball | 92% | 52% |
| Hockey | 97% | 50% |
| Football | 100% | 44% |

Channels with at least 5 videos on each side. Where nothing changed, sports have 14 to 43 channels each, so their shares are rough. Source: `channel_lift_summary.csv`.

### A7. Named channels moved from 1.00x (Manchester United) to 12.76x (ESPN College Football): schedules and counting mix at the channel level

| Sport | Channel | Videos before / after | New over earlier videos (range) |
| --- | --- | --- | --- |
| Soccer | FC Barcelona | 31 / 43 | 3.83x (2.30x to 6.53x) |
| Soccer | CBS Sports Golazo | 171 / 314 | 2.66x (1.85x to 3.59x) |
| Soccer | ESPN FC | 270 / 218 | 2.06x (1.47x to 2.82x) |
| Soccer | Manchester United | 26 / 60 | 1.00x (0.43x to 2.66x) |
| Soccer | Major League Soccer | 82 / 183 | 9.11x (4.77x to 17.94x) |
| Basketball | NBA | 156 / 67 | 1.14x (0.62x to 2.03x) |
| Basketball | FIBA Basketball | 368 / 370 | 2.32x (1.71x to 3.17x) |
| Basketball | Club 520 Podcast | 71 / 90 | 1.12x (0.86x to 1.47x) |
| Basketball | First Things First | 74 / 107 | 3.54x (2.82x to 4.49x) |
| Basketball | Gil's Arena | 19 / 53 | 3.58x (2.82x to 4.53x) |
| Baseball | MLB | 468 / 793 | 1.51x (1.27x to 1.83x) |
| Baseball | Jomboy Media | 7 / 10 | 2.22x (1.38x to 3.53x) |
| Baseball | Los Angeles Dodgers | 8 / 25 | 1.25x (0.84x to 2.06x) |
| Baseball | ESPN MLB | 45 / 45 | 1.19x (0.62x to 2.28x) |
| Baseball | Fuzzy | 19 / 26 | 1.47x (1.25x to 1.72x) |
| Hockey | NHL | 43 / 112 | 1.82x (1.15x to 3.49x) |
| Hockey | The Hockey Guy | 78 / 95 | 1.77x (1.44x to 2.20x) |
| Hockey | sdpn | 52 / 85 | 1.28x (0.97x to 1.75x) |
| Hockey | NBC Sports Philadelphia | 45 / 97 | 1.78x (1.18x to 2.87x) |
| Hockey | Edmonton Oilers | 14 / 70 | 2.19x (1.06x to 5.87x) |
| Football | ESPN College Football | 52 / 498 | 12.76x (9.19x to 18.51x) |
| Football | Nightcap | 101 / 223 | 1.30x (1.08x to 1.54x) |
| Football | NFL on ESPN | 73 / 308 | 2.66x (1.96x to 3.60x) |
| Football | Speakeasy | 81 / 228 | 1.43x (1.19x to 1.68x) |
| Football | NFL on NBC | 129 / 552 | 1.75x (1.38x to 2.26x) |

The five largest channels by stored long-form views in each of the five largest sports, with at least 5 videos on each side at 28 to 30 days. Mean views per new video over mean per earlier video; ranges resample each channel’s videos. A channel whose summer had no games, such as college football, mixes its season start with the count; Major League Soccer’s before window overlaps the World Cup summer. Use: ask each of these for its engaged share before renewing a package. Source: `channel_examples.csv`.

### A8. Five of seven title-tagged formats rose clearly; full game or match and reaction are within noise. No format is shown to differ

Long-form videos tagged from their titles, all sports. Live streams and watchalongs rose +108%; press conferences and interviews +47%; the ranges overlap. Price formats from each creator’s engaged share, not from this chart.

| Group | After ÷ before |
| --- | --- |
| Highlights | +74% |
| Full game or match | +17% |
| Press conference or interview | +47% |
| Live stream or watchalong | +108% |
| Podcast or show | +82% |
| Analysis or preview | +83% |
| Reaction | +34% |

Keyword rules on video titles, applied in the order shown; most long-form videos match no rule and are left out. Each format compares the same channels’ tagged videos before and after; formats with at least 10 such channels. Video titles are not published. Source: `format_lift.csv`.

### A9. Long-form rose in every sport; Shorts did not clearly rise in any, and basketball Shorts are mixed (+17% typical, −61% views per video)

Basketball Shorts give opposite signals, +17% on the typical video but −61% on views per video, so a basketball package needs its own Shorts forecast. Football’s typical long-form rose +135% while its Shorts fell 29%; hockey +94% and −16%. Do not promise Shorts delivery from long-form growth; set package guarantees from each creator’s counts by format.

| Group | Long-form, one month old | Shorts, two weeks old |
| --- | --- | --- |
| Soccer | +131% | −4% |
| Basketball | +112% | +17% |
| Baseball | +97% | −21% |
| Running | +101% | +4% |
| Hockey | +94% | −16% |
| Golf | +87% | −26% |
| Football | +135% | −29% |
| Tennis | +87% | −8% |
| General Sports | +107% | −21% |
| Rugby | +129% | +3% |
| Cricket | +134% | +16% |
| Cycling | +39% | −28% |
| Swimming | +122% | +29% |

Bar height is views after ÷ before on the typical video. Sports with at least 10 Shorts channels; ranges are in appendix A16. Source: `lift_by_segment.csv`.

### A10. Average within-week percentile shifts were small (-1.5 to +3.7 points); individual ranking stability is not established

| Sport | Across the change | Nothing changed: July 1 split | Nothing changed: Sept 14 split |
| --- | --- | --- | --- |
| Baseball | +1.0 | -1.6 | +1.2 |
| Basketball | +2.2 | -3.6 | -3.6 |
| Cricket | +3.7 | -3.9 | +0.8 |
| Cycling | -1.5 | +6.0 | +7.9 |
| Fantasy Sports | +1.5 | -1.2 | +1.0 |
| Football | +3.1 | -1.6 | +3.5 |
| General Sports | +2.8 | -0.3 | +1.1 |
| Golf | +0.7 | -0.2 | +2.9 |
| Hockey | +1.2 | -0.6 | +2.1 |
| Rugby | +3.5 | +2.6 | +2.5 |
| Running | +1.9 | -3.4 | +3.1 |
| Soccer | +2.3 | +3.9 | +1.6 |
| Swimming | +0.3 | -3.9 | +4.7 |
| Tennis | +0.6 | -1.0 | +2.7 |

For a ranking, hold sport, format, video age, and count definition constant; average shifts can hide large individual moves. Shift in each sport’s average percentile within its publish week, in points. Spread across sports: 1.4 at the change against 2.5 to 3.0 where nothing changed. Source: `trial_rank_check.csv`.

### A11. By video length: no length is shown to gain more than another

One-to-three-minute videos rose most, but differences between lengths are not established, and length does not identify format; for formats tagged from titles, see appendix A8.

| Group | After ÷ before |
| --- | --- |
| <=60s | +58% |
| 61-180s | +115% |
| 3-10 min | +60% |
| 10-20 min | +72% |
| 20-60 min | +70% |
| >60 min | +64% |

Long-form views per video at one month old, against the same channels’ earlier videos of that length. Lines show the range from channel sampling. Source: `lift_by_segment.csv`.

### A12. Every size third rose; the middle third also rose 23% in a separate no-change window

The middle third rose 106% across the change and 23% in a separate no-change window. That warns against reading its full rise as counting; it does not measure how much was drift. Use each creator’s measured engaged share.

| Group | Across the change | Where nothing changed |
| --- | --- | --- |
| Smallest third | +56% | −19% |
| Middle third | +106% | +23% |
| Largest third | +69% | 0% |

Size is each channel’s median lifetime views on long-form videos published January to April 2026, which sit outside both groups. Bar height is views after ÷ before. Source: `lift_by_segment.csv`.

## Appendix: method checks

### A13. The typical video rose 2.13x; views per video rose 1.74x

| Comparison | Views per video | Typical video | Channels | Videos before / after |
| --- | --- | --- | --- | --- |
| Long-form, 28 to 30 days old | 1.74x (1.60x to 1.94x) | 2.13x (1.96x to 2.31x) | 746 | 13,254 / 23,962 |
| Shorts, 12 to 14 days old | 0.85x (0.62x to 1.08x) | 0.91x (0.84x to 0.99x) | 554 | 39,485 / 28,742 |

Views per video weights each channel’s videos by their views. Typical video uses the log of views, so small videos count as much as hits. Ranges are 95% channel-resampling intervals. They assume viewing otherwise held steady. Source: `primary_lift.csv`.

### A14. The step arrived with August 27 publishes, three days after the switch

| Published | Views per video | Typical video | Channels | Videos |
| --- | --- | --- | --- | --- |
| 7/27 to 8/9 | 1.01x (0.83x to 1.24x) | 1.07x (1.00x to 1.15x) | 688 | 7,775 |
| 8/10 to 8/19 | 1.19x (0.94x to 1.56x) | 1.11x (1.01x to 1.23x) | 541 | 2,663 |
| 8/20 to 8/23 | 1.05x (0.85x to 1.30x) | 1.29x (1.15x to 1.49x) | 527 | 2,562 |
| 8/24 to 8/26 | 1.19x (1.03x to 1.39x) | 1.29x (1.19x to 1.40x) | 522 | 2,181 |
| 8/27 to 8/30 | 1.99x (1.69x to 2.34x) | 2.37x (2.07x to 2.79x) | 546 | 3,200 |
| Aug 31 on | 1.74x (1.59x to 1.94x) | 2.13x (1.97x to 2.31x) | 746 | 23,962 |

Why the full step starts with August 27 publishes, not August 24, is unknown. Source: `transition_lift.csv`.

### A15. Where counting held still, views moved 0.85x to 0.97x, not 1.74x

| Comparison | Views per video | Typical video | Channels | Counted as no-change |
| --- | --- | --- | --- | --- |
| Long-form, after vs before July 1 (old rule) | 0.96x (0.79x to 1.20x) | 1.05x (0.97x to 1.15x) | 623 | Yes |
| Long-form, Sept 14 on vs Aug 31 to Sept 13 (new rule) | 0.89x (0.81x to 0.97x) | 0.95x (0.88x to 1.00x) | 757 | Check only: fell |
| Shorts, after vs before May 1 | 0.97x (0.80x to 1.19x) | 1.03x (0.96x to 1.10x) | 341 | Yes |
| Shorts across the change (rule unchanged) | 0.85x (0.62x to 1.08x) | 0.91x (0.84x to 0.99x) | 554 | Yes |
| Shorts across the change, without its largest channel | 0.99x (0.88x to 1.11x) | 0.91x (0.83x to 0.99x) | 553 | Check only |
| Long-form, same weeks in 2025 (unequal ages) | 0.88x (0.72x to 1.10x) | 0.70x (0.37x to 0.97x) | 335 | Check only |
| Shorts, same weeks in 2025 (unequal ages) | 2.42x (0.61x to 7.66x) | 1.03x (0.87x to 1.27x) | 48 | Check only |

Source: `null_comparisons.csv`.

### A16. Every sport’s typical long-form video rose 1.39x to 2.35x; no sport’s typical Short rose more than 1.29x

| Group | Segment | Views per video | Typical video | Channels |
| --- | --- | --- | --- | --- |
| Long-form, sport | Soccer | 2.14x (1.62x to 2.84x) | 2.31x (1.85x to 2.87x) | 171 |
| Long-form, sport | Basketball | 1.90x (1.43x to 2.47x) | 2.12x (1.65x to 2.64x) | 93 |
| Long-form, sport | Baseball | 1.56x (1.48x to 1.81x) | 1.97x (1.78x to 2.27x) | 85 |
| Long-form, sport | Running | 1.47x (0.85x to 2.51x) | 2.01x (1.62x to 2.52x) | 68 |
| Long-form, sport | Hockey | 1.80x (1.57x to 2.18x) | 1.94x (1.73x to 2.21x) | 58 |
| Long-form, sport | Golf | 1.34x (1.10x to 1.71x) | 1.87x (1.54x to 2.14x) | 55 |
| Long-form, sport | Football | 2.12x (1.60x to 3.71x) | 2.35x (1.92x to 2.99x) | 49 |
| Long-form, sport | Tennis | 1.44x (1.12x to 1.72x) | 1.87x (1.57x to 2.28x) | 28 |
| Long-form, sport | General Sports | 1.56x (1.34x to 2.21x) | 2.07x (1.68x to 2.50x) | 25 |
| Long-form, sport | Rugby | 1.81x (1.43x to 2.26x) | 2.29x (1.79x to 2.84x) | 24 |
| Long-form, sport | Cricket | 1.67x (1.29x to 2.40x) | 2.34x (1.83x to 3.04x) | 19 |
| Long-form, sport | Cycling | 1.18x (0.81x to 1.81x) | 1.39x (1.12x to 1.95x) | 19 |
| Long-form, sport | Fantasy Sports | 2.04x (1.38x to 3.02x) | 2.05x (1.39x to 3.00x) | 14 |
| Long-form, sport | Swimming | 2.54x (1.78x to 5.67x) | 2.22x (1.67x to 3.66x) | 14 |
| Shorts, sport | Soccer | 1.23x (0.96x to 1.54x) | 0.96x (0.86x to 1.08x) | 135 |
| Shorts, sport | Basketball | 0.39x (0.21x to 1.35x) | 1.17x (0.92x to 1.58x) | 70 |
| Shorts, sport | Hockey | 0.73x (0.62x to 1.35x) | 0.84x (0.72x to 1.06x) | 56 |
| Shorts, sport | Baseball | 0.70x (0.57x to 0.90x) | 0.79x (0.63x to 1.00x) | 53 |
| Shorts, sport | Golf | 0.96x (0.59x to 1.27x) | 0.74x (0.61x to 0.87x) | 40 |
| Shorts, sport | Running | 0.88x (0.67x to 1.56x) | 1.04x (0.78x to 1.49x) | 36 |
| Shorts, sport | Football | 0.89x (0.52x to 1.58x) | 0.71x (0.48x to 1.16x) | 34 |
| Shorts, sport | General Sports | 0.92x (0.70x to 1.19x) | 0.79x (0.60x to 1.16x) | 27 |
| Shorts, sport | Tennis | 1.52x (0.88x to 2.75x) | 0.92x (0.72x to 1.30x) | 23 |
| Shorts, sport | Rugby | 1.14x (0.86x to 1.92x) | 1.03x (0.74x to 1.59x) | 17 |
| Shorts, sport | Cycling | 0.76x (0.55x to 0.85x) | 0.72x (0.59x to 0.92x) | 13 |
| Shorts, sport | Swimming | 2.00x (0.97x to 5.37x) | 1.29x (0.98x to 1.89x) | 12 |
| Shorts, sport | Cricket | 0.75x (0.42x to 2.18x) | 1.16x (0.75x to 1.85x) | 11 |

Spread across sports: 0.21 at the change against 0.38 and 0.25 where nothing changed (standard deviation of log ratios). Differences between segments are not established. Swimming and fantasy sports have the highest point estimates but the widest ranges, on 14 channels each; do not sell them as the biggest gainers. Source: `lift_by_segment.csv, segment_dispersion.csv`.

### A17. 19 re-cuts of long-form put the rise at +46% to +85%; comparing with Shorts gives +78% to +109%

| Variant | Views per video | Typical video |
| --- | --- | --- |
| Primary (balanced channel weights) | 1.74x (1.60x to 1.94x) | 2.13x (1.96x to 2.31x) |
| Weights = pre-group video count (version 1 primary) | 1.77x (1.60x to 1.94x) | 2.43x (2.03x to 3.10x) |
| Equal weight per channel | 1.46x (1.27x to 1.78x) | 2.03x (1.91x to 2.15x) |
| Poisson (PPML) with channel fixed effects, level views | 1.74x (1.60x to 1.91x) | n/a |
| Post starts 2026-08-24 (no buffer) | 1.72x (1.58x to 1.91x) | 2.09x (1.92x to 2.28x) |
| Post starts 2026-08-27 | 1.78x (1.61x to 1.98x) | 2.17x (2.00x to 2.37x) |
| Post starts 2026-09-07 | 1.78x (1.63x to 1.98x) | 2.13x (1.97x to 2.32x) |
| Age window 27-31 days | 1.71x (1.58x to 1.86x) | 2.10x (1.95x to 2.28x) |
| Age window 28.5-29.5 days | 1.74x (1.57x to 1.93x) | 2.19x (1.98x to 2.43x) |
| Age window 20-28 days (post readings about 2 days younger) | 1.55x (1.24x to 1.93x) | 2.02x (1.81x to 2.31x) |
| Age window 26-28 days (ages matched) | 1.54x (1.27x to 1.89x) | 1.98x (1.74x to 2.34x) |
| Pre group: published 2026-07-01 or later only | 1.69x (1.53x to 1.90x) | 2.06x (1.91x to 2.22x) |
| Post group: published 2026-09-14 or later only | 1.66x (1.49x to 1.88x) | 2.06x (1.89x to 2.27x) |
| Drop readings stamped before ingestion | 1.74x (1.60x to 1.94x) | 2.13x (1.96x to 2.31x) |
| Drop long-form at or under 60 seconds | 1.73x (1.59x to 1.92x) | 2.12x (1.97x to 2.30x) |
| Drop durations over 1 day or null | 1.74x (1.60x to 1.94x) | 2.13x (1.96x to 2.31x) |
| Post group uses only earlier (prev) readings, like the pre group | 1.76x (1.59x to 1.95x) | 2.14x (1.99x to 2.32x) |
| Drop top 1% channels by pre views | 1.85x (1.66x to 2.07x) | 2.14x (1.96x to 2.33x) |
| Drop the one channel with the largest share of the version-1 numerator | 1.74x (1.59x to 1.92x) | 2.12x (1.97x to 2.31x) |
| Long-form / shorts ratio, channels with both (diff-in-diff; windows differ) | 2.09x (1.60x to 2.82x) | 2.33x (2.08x to 2.60x) |
|   same, without the dominant Shorts channel | 1.78x (1.56x to 2.04x) | 2.33x (2.07x to 2.61x) |

19 cuts of long-form against itself give +46% to +85%. The two rows comparing long-form with Shorts give +78% and +109%. Source: `sensitivity.csv`.

### A18. Last season’s videos barely moved in central models, so most 2025 baseline views are old-count. Modeled uplift for 2025 videos: 0.6% to 2.4% in two central scenarios; timestamp bounds span 0.3% to 25.3%

| Videos | Stored views | Flat-rate scenario | Even-spread scenario | Widest the timestamps allow |
| --- | --- | --- | --- | --- |
| Published Aug 24, 2026 or later | 3,676,114,016 | +74.4% | +74.4% | +74.4% |
| Published Jul 26 to Aug 23, 2026 | 1,030,638,645 | +4.2% | +30.7% | +2.9% to +74.3% |
| Published Jan 1 to Jul 25, 2026 | 7,775,150,749 | +1.6% | +6.1% | +0.4% to +40.0% |
| Published in 2025 | 4,481,464,795 | +0.6% | +2.4% | +0.3% to +25.3% |
| All long-form | 16,963,368,205 | +11.6% | +16.2% | +10.7% to +43.4% |

How much of each group’s stored views the new count added. Every column assumes one factor (1.74x) for every view after the change. Older videos earned most of their views before it. Source: `stock_translation.csv, review_checks.csv`.
