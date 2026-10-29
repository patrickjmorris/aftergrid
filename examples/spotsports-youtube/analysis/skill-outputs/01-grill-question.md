# 01 grill-question: question brief

Skill: `skills/grill-question/SKILL.md` (portable path; the Engine reference does not apply).

## Original ask (verbatim)

> How much did this change move our long-form numbers? I just want it sized. If long-form views went up more than 25% because of this, we'll need to adjust how we rank or compare videos.

Context from the brief: on 2026-08-24 YouTube began counting a view on play start for every format. Before, a long-form or live view counted after 30 seconds. Shorts already counted on play start since March 2025. The old measure survives as "engaged views," visible only to channel owners.

## Settled by the owner (recorded, not re-asked)

1. Purpose: size the effect. The owner said "I just want it sized."
2. Action threshold: above 25% caused by the change, they adjust how they rank or compare videos. At or below 25%, they do not.

The owner is not available. No other answers exist. Every other choice below is my proposed interpretation, marked as such.

## Sharpened question

For long-form videos in the Spot Sports catalog, by what percent did the 2026-08-24 counting rule raise YouTube's public view count, compared with what the old 30-second rule would have counted for the same viewing? Is that percent above 25%, and how sure are we?

## Reader, decision, goal

- Reader: the Spot Sports owner. Not a data specialist. Wants one number and a yes or no against 25%.
- Decision: adjust ranking and comparison of videos (yes above 25%, no otherwise).
- Goal in the owner's units: rankings and comparisons that treat videos fairly when their views were counted under different rules.
- Threshold: 25% lift caused by the change (owner-stated).

## Metric and units (proposed)

- Primary: the lift on views earned after the change. Lift = (views counted under the new rule) / (views the old rule would have counted for the same plays) - 1. Units: percent.
- This is a causal quantity. The old-rule count after 2026-08-24 is not observable to us (engaged views are owner-only). So it must be estimated from a counterfactual comparison, not read off a column.
- Secondary translation: the lift on stored lifetime counts. A video published before the change earned part of its views under the old rule. Its lifetime count rises by less than the flow lift. I will report how the flow lift maps to lifetime counts by publish date, because rankings mix vintages.

Alternative and what it would change: measuring the jump in total catalog views (stock) would mix the rule change with catalog growth and video aging. It would answer "how big are our totals now," not "how much did the rule inflate a view." I recommend the flow lift as the headline.

## Population (proposed)

- Include: `is_yt_short = 0` (long-form). Live streams cannot be separated in this table. They fall under long-form, and the rule changed for both, so they stay in.
- Exclude: `is_yt_short` null (517 rows, 8.3M views of about 35.7B). Reported, not imputed.
- Known limit: the table holds only videos still available on 2026-10-27. Deleted or private videos are absent (survivorship).
- Weighting: "our long-form numbers" read as total views (view-weighted). I will also report a per-video (median) version, because a ranking compares videos one by one.

## Time window and timezone

- Change date: 2026-08-24. YouTube did not publish an hour in the sources I found. Data are UTC. I will treat 2026-08-24 as a transition day and test sensitivity to the boundary.
- Pre period: readings and view accrual before 2026-08-24. Post period: after. Data run to the 2026-10-27 extraction.
- Ingestion time differs from publish time. Ages are measured from `published_at`.

## Comparison (proposed)

- Within long-form, compare views at the same video age before and after the change. Age matters because a video earns most of its views early.
- Net out everything that is not the rule by using Shorts as a control. Shorts did not change on 2026-08-24 per the brief and most public sources.
- Placebo: run the same comparison across 2025-08-24, one year earlier, where no rule changed. This tests whether late-August sports seasonality alone produces a gap.

## Rival explanations to test

1. Seasonality. Late August starts the NFL, college football, and European soccer seasons. Long-form views could rise for that reason alone.
2. Catalog mix. New channels or sports entering the catalog could change typical views per video.
3. Spot Sports fetch cadence. A change in when stats are refetched changes the age at which views are read.
4. Shorts also changed. One public summary claims a Shorts lift too. If Shorts jumped on 2026-08-24, Shorts is not a clean control.
5. Retroactivity. Sources say existing counts were not restated. If old videos' counts jumped at the boundary, the stock effect is larger than the flow model implies.

## Evidence that would change the answer

- Shorts per-age views shift at 2026-08-24 as much as long-form: the control is broken and the lift is not identified this way.
- The 2025-08-24 placebo shows a long-form vs Shorts gap of similar size: the "lift" is seasonality.
- The lift differs strongly by video duration or sport: one uniform adjustment would misrank videos even within the post period.
- Lift estimates on both sides of 25% under reasonable choices: the honest answer is "cannot tell," not a yes or no.

## Counter-metric

This is a sizing, not an optimization target. If the owner later ranks by post-change views, the counter-metric is engaged views (plays past 30 seconds), because play-start views reward thumbnails that get clicked and abandoned. Spot Sports cannot see engaged views for third-party channels, so this stays a stated gap.

## Available source

`../data/videos.sqlite`, table `videos`, 535,168 rows, 1,070 channels (the brief says about 900). Same rows as `videos.csv`. Public context from web search (third-party articles, not YouTube's own page): the change applies to future plays only; existing counts were not restated; Shorts already counted on play start; one vendor estimated about +30% for long-form. That vendor figure is not used as evidence here.

## Unresolved, with effect (owner not available; my default in brackets)

1. Does "25%" mean the per-view lift on new viewing, or the change in stored lifetime counts? [Per-view lift. Lifetime counts are reported beside it.] Effect: lifetime lift is smaller for older videos, so the two could fall on opposite sides of 25%.
2. Does ranking use lifetime views, recent velocity, or something else? [Unknown. I report both flow and lifetime translations.] Effect: changes which adjustment the owner needs.
3. Aggregate or per-video? [Aggregate headline, per-video median beside it.] Effect: big channels dominate the aggregate.
4. Do live streams count as long-form? [Yes, inseparable here.] Effect: small unless live is a large share.
