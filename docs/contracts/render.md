# Render contract

`aftergrid render <finding-dir> [--png]` turns validated source into the Reader artifact. Implementation: `src/commands/render.ts`, `src/render/`. Reference the output is compared against: the hand-authored `render/finding.template.html` in the exemplar Findings (`ag-finding-exemplars-a2f`).

## Order of operations

1. Validate the whole Finding with the shared validator. Any error (schema, hashes, references, template, chart subset, digest, Decision bindings) refuses the render and leaves previous outputs untouched.
2. Load results; resolve every token through the shared strict resolver, which also enforces the export allowlist and the provisional policy. A value outside `export_policy.allowed_fields` cannot appear anywhere: prose, table, chart data, chart text or metadata.
3. Render each chart: the validated Vega-Lite spec, `data` bound by the renderer to the exported columns of its result set (numeric columns as numbers, everything else as saved), the pinned house style applied as the Vega-Lite `config`, title set to the resolved chart title, rendered to SVG in Node with no canvas. The SVG gets `role="img"`, a `<title>` (the Claim) and a `<desc>` (the description). With `--png`, a WASM rasterizer writes a preview; it needs a TrueType font (`AFTERGRID_FONT` or a common system path) and says so when none is found.
4. Build one HTML file: draft banner (any readiness other than verified `ready`), title, Reader/owner/generated/revision line, Answer (memo) with the material caveat of the answer-bearing Claim beside it, Decision it informs, one section per Claim in manifest order (type label, sentence, memo body with `<!-- chart -->`/`<!-- table -->` markers replaced by the rendered figure with its data table or the table, who-is-counted / compared-with / when, expandable exclusions and limits, expandable calculation listing the resolved evidence references, definitions, derivations and typed external sources, a per-Claim question link), How we checked (generated facts: Checks by outcome, definitions with recorded lifecycle and approval note, reviews with staleness, publication approval, Snapshot guarantees, coverage) followed by the memo section, What would change our mind (memo), the single Reader action (mailto with Finding and Claim ids only, plus copyable owner contact and ids), Appendix (memo), footer (generated-at, coverage, canonical location, "cannot know whether a newer revision exists").
5. Refuse to write if any output byte sequence contains `export_policy.private_marker`.

## Safety

Every interpolation is HTML-escaped. Memo markdown is rendered with raw HTML escaped, images dropped and links limited to `http(s):` and `mailto:`. Chart SVG comes from Vega on data the renderer bound. No script runs on the page.

## Pinned versions

`renderer.version` and `renderer.house_style_version` in the manifest must match `RENDERER_VERSION` and `HOUSE_STYLE_VERSION` in `src/render/charts.ts` for a publication render; a mismatch is reported (the digest already covers them). The house style: grey plus one accent, no gridlines, direct axis labels, chart title states the Claim, legends off by default, system font stack. Direct value labels on marks are the chart author's job (`/iterate-visual`), expressed in the spec as a layered `text` mark.

## Accessibility and phone

Skip link, semantic headings, `<details>`/`<summary>` for every expansion (keyboard operable), `scope` on table headers, labelled inline SVG, a viewport meta tag, a 40rem column with 1rem gutters, single-column definition lists and scrollable tables under 30rem.
