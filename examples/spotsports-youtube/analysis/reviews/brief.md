# Review this analysis

Follow the analysis-review skill: `skills/analysis-review/SKILL.md`. Read it in full.

- **The question:** `/tmp/aftergrid-eval/brief.md`.
- **The artifact:** `/tmp/aftergrid-run3/`. Start with `report.md`, then `skill-outputs/`, `scripts/` (the entry point is `run_all.py`), and `results/`.
- **Row-level data:** `/tmp/aftergrid-eval/data/videos.sqlite`. Use it to check claims directly, not just the saved CSVs.

Inspect only. Write your review to `/tmp/aftergrid-run3-review/<your-name>/review.md` and nowhere else. Do not read other folders under `/tmp/aftergrid-eval/` or any other `/tmp/aftergrid-*` folder. In the aftergrid repository, read only `skills/`.

For each finding give:
- the location;
- the evidence, including a query you ran;
- why it matters to the owner's decision;
- the narrow fix;
- the severity: material or minor.

Refute your own findings before reporting. Keep a section for claims you could not verify. If nothing material remains, say so plainly.
