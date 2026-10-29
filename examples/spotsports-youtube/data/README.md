# Data

The analysis reads one private extract of Spot Sports' video catalog. The extract is not committed.

- `extract.sql` is the read-only query that produced it on 2026-10-27. It returns one row per available video published 2025-07-01 to 2026-10-26: hashed ids, sport, Short flag, duration, publish and ingest times, the latest view count and when it was read, and one earlier reading if any. It holds no titles and no viewer data.
- `titles.sql` is a second read-only query, run 2026-10-28: public channel titles and video titles keyed by the same hashed ids. Channel titles are published with owner approval. Video titles are used only to tag editorial format (`../analysis/scripts/titles.py`) and are never written to results. Without `titles.csv`, the format and named-channel tables are skipped.
- `build_sqlite.py` turns `videos.csv` into `videos.sqlite`, the file the analysis reads.
- `../analysis/extract_manifest.json` records each extract's SHA-256 and row count. With a copy of the same file, `python3 -I ../analysis/scripts/run_all.py` regenerates every table in `../analysis/results/`. A fresh extract will differ, because view counts change every day.
