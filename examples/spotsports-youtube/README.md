# Sports YouTube's fall 2026: report and sell on engaged views

Access to numbers does not tell anyone what to do. This example takes one real dataset and works it from a raw count to a decision for sports channels, using the aftergrid skills in order.

Spot Sports catalogs videos from about 1,040 sports YouTube channels in 18 sports and stores each video's public view count. On August 24, 2026, YouTube started counting a long-form view when a video starts playing; the old count, now called engaged views, needed a viewer to keep watching. The change landed as the football and soccer seasons began. The analysis asks how much public views moved, whether the sports calendar explains it, and what creators, clubs, leagues, and sponsors should report and price on.

**The answer:** across 746 sports channels in 14 sports, long-form videos published August 31 to September 29 had 74% more first-month public views than the same channels' summer videos (range 60% to 94%). Basketball and hockey rose the same week as football, before the NBA and NHL openers, and Shorts, whose count did not change, rose clearly in no sport. That points to the new count, but the analysis cannot separate counting from real growth and did not see engaged views. Named channels ran from about 1.0x to 12.8x, so each channel should report and price on its own engaged views, not a blanket 1.74x.

The owner approved publishing these YouTube metrics and public channel titles on 2026-10-27. Video titles are used only to tag format and are not published. Nothing here identifies a viewer.

## Read it

- The deck: [`deck/spotsports-youtube-case-study.pdf`](deck/spotsports-youtube-case-study.pdf), 10 slides plus data tables. It is printed from [`deck/spotsports-youtube-case-study.html`](deck/spotsports-youtube-case-study.html).
- The same story as a page: [`docs/examples/spotsports-youtube.md`](../../docs/examples/spotsports-youtube.md).
- The analysis: [`analysis/report.md`](analysis/report.md), and each skill's output in [`analysis/skill-outputs/`](analysis/skill-outputs/).
- How it was built, skill by skill: [`docs/examples/spotsports-youtube-how-it-was-built.md`](../../docs/examples/spotsports-youtube-how-it-was-built.md), with the full record in [`run-record.md`](run-record.md).

## Layout

| Path | What it holds |
| --- | --- |
| `data/` | The two read-only extract queries (metrics, and titles) and a loader. The extracts themselves are private and not committed |
| `analysis/` | `report.md`, `skill-outputs/` (one per skill), `scripts/` (Python standard library only), `results/` (every table), `external/` (published estimates, with sources), `reviews/` (independent reviews), `data-issues/` |
| `scripts/` | Builds the deck and the site page from the results, and verifies them |
| `deck/` | The built deck: HTML, and the PDF printed from it |

## Check it

```sh
node examples/spotsports-youtube/scripts/verify.mjs
```

This checks every result file against its hash in `analysis/results_manifest.json`. It then checks that the deck, the PDF, the site page, and the skill outputs cite only numbers in those results. It does not need the private extract.

With a copy of the extract (`data/README.md`), the whole analysis reruns in about a minute and reproduces every result file byte for byte:

```sh
cd examples/spotsports-youtube/analysis && python3 -I scripts/run_all.py
```

To rebuild the deck and the page (the PDF uses headless Chrome; set `CHROME` if it is not at the macOS default path, or pass `--html-only`):

```sh
node examples/spotsports-youtube/scripts/build-deck.mjs
node examples/spotsports-youtube/scripts/build-page.mjs
```

## Status

Agent-made and agent-reviewed. Not human-approved. The metric definition is proposed. Recommendations are proposals; the people they name decide.
