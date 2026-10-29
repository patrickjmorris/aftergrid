# Run record

How the analysis was made. Agents did the work; the owner answered questions and approved publication.

| Field | Value |
| --- | --- |
| Dates | 2026-10-27 to 2026-10-28 |
| Harness | Claude Code inside T3 Code, with delegated agents |
| Analysis model | Claude Opus 5.5 (`claude-opus-5-5`) |
| Reviewer models | Claude Opus 5.5, GPT-6.1 Sol (`codex/gpt-6.1-sol`), Gemini 4 Argon (`antigravity/gemini-4-argon-high`). Every reviewer was an AI model |
| Data | A hashed, read-only extract of Spot Sports' video catalog: 535,168 videos, taken 2026-10-27, and a second read-only extract of public channel and video titles keyed to the same hashed ids, taken 2026-10-28 with owner approval. Both are private and not committed; `data/` holds the queries and loader. Reruns need the extracts. The result tables are public |
| Owner decisions | Publish these YouTube metrics (2026-10-27). The question: size the change; act if long-form views rose more than 25% |

## Steps

1. **grill-question** turned "how much did this move our numbers?" into a measurable question with the owner's 25% line.
2. **explore-data** inventoried when every stored view reading was taken, relative to each video's age and to August 24. That decided which comparisons are clean.
3. **define-metric** fixed the measure: views at 28 to 30 days old, compared within the same channels.
4. **diagnose-change** sized the change and tested it:
   - placebos where nothing changed;
   - the timing of the step;
   - segments;
   - sensitivity variants;
   - rival explanations;
   - published estimates by other methods.
5. **make-the-call** sized the impact for each group that would act differently: creators, clubs and leagues, and sponsors. It weighed options and named what would reverse the call.
6. **analysis-review** ran four reviews by AI models over two rounds. Each round was followed by a revision. Two further AI-model reviews checked the deck: one read it as the owner, one checked every claim against the results. A red-team round followed: three AI models read the deck and the analysis as a measurement statistician, a sponsor's analytics lead and a data executive. Its revision changed wording only.

The reviews changed the result:

- **Weights.** Channel weights were balanced, which moved the headline from 1.77x to 1.74x.
- **The multiplier.** A first-draft single multiplier was rejected after it failed on the videos it would change.
- **The transition.** The transition weeks were separated out.
- **The claim.** After the red team, the +74% is a cohort contrast with counting as its leading explanation, not an established cause. The sponsor figures became a stated scenario. The old 30-second threshold is described as an unpublished proxy.

Every finding and response is in [`analysis/skill-outputs/06-analysis-review.md`](analysis/skill-outputs/06-analysis-review.md). The reviews themselves are in [`analysis/reviews/`](analysis/reviews/).

## The deck

After the analysis, the deck went through 35 rounds of AI-model grading on a fixed brief: clear takeaway, clear impact, and, after the owner reframed the deck around sports, sports specificity. Two models graded each round (Claude Opus 5.5 and GPT-6.1 Sol), against a published industry article as a reference. Each round's fixes were applied and checked against the results. The owner set the tie-break when the graders disagreed: favor the more cautious one. The final round graded the deck A on all three from Sol and A-, A-, A from Opus. These are AI grades, not a human review.

The sports reframe added `analysis/scripts/sports.py` (sport timing, channel-level spread) and `analysis/scripts/titles.py` (named channels and title-tagged formats). Both run inside `run_all.py`, and every earlier result reproduced byte for byte.

## What was not done

- **No human approval.** No human approved the analysis or the metric definition. No human review is recorded.
- **No writes.** Nothing was written to the Spot Sports database or repository. No credential is committed.
