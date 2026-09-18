# Skills-first implementation evidence

Recorded September 17, 2026 (US Eastern). The implementation is locally complete; browser QA and public
deployment are still pending. This record distinguishes observed checks from release work that remains.

## Delivered

- Fourteen installable skills, including five new analytical workflows. Thirteen support portable work;
  `setup-aftergrid` is Engine-specific. Existing Engine procedures remain in skill-local references.
- A deterministic production site: landing page, searchable catalog and fourteen skill pages, quickstart,
  workflow guide, four worked examples (including lesson reuse), three fieldnotes and index pages, and the
  canonical synthetic Finding.
- Three synthetic situations and a fourth lesson-reuse exercise, committed CSVs, executable teaching
  arithmetic, and actual isolated-agent output. The source-backed NYC examples retain their draft status.
- Primary-source research on Matt Pocock, Compound Engineering and pstack. No endorsement, adoption or
  comparative model-performance claim is made.

## Observed checks

| Evidence | Result | Boundary |
| --- | --- | --- |
| Full repository suite, Node 24.21.0 on macOS | 534 passed, 0 failed | Local run; not the entire supported OS matrix |
| Distribution validation and focused tests | 14 skills valid; 29 tests passed | Metadata, policy and installed reference integrity |
| Actual skills installer 1.7.0, isolated destinations | 14 Codex skills, 1 Cursor skill, 1 Claude Code skill copied successfully | Local checkout installation; not runtime parity |
| Isolated Codex forward trial | Four tasks completed with five skills, without answer key | One agent, serial tasks; not a benchmark or independent reviewers |
| Recorded computation replay | Four parsed JSON results exactly match saved stdout | Replays calculations, not AI reasoning |
| Fixture validation | All five fixtures valid | Draft and not-ready warnings preserved |
| Packed CLI smoke | All steps passed, no failed steps | Clean tarball install and supported local fake services; no npm publication |
| NYC artifact checks | Both retained example trees pass | Neither has human publication approval |
| Site checks | 27 pages, 14 skill sources; deterministic generation and link/structure audit pass | Offline checks; no rendered layout or interaction claim |
| Independent source review | No unresolved release-blocking defect | Does not substitute for browser inspection |

The original installer-results record is [skills-first-install-results.json](skills-first-install-results.json).
The [trial record](../../examples/skills-lab/runs/README.md) retains input hashes, original answers,
plans, lesson, scripts, stdout and coordinator verification. The follow-up's two exact decomposition
conventions are explained explicitly; differing interaction allocation is not a failed reconciliation.

## Reproduce

```bash
pnpm test
node src/cli.ts plugin validate --json
pnpm validate:fixtures
pnpm smoke:pack
pnpm check:skills-lab
pnpm check:site
node scripts/examples-check.mjs
```

Use supported Node 22.18 or 24 and pnpm. Python 3 is required for the recorded calculation replay. The site
build uses the existing marked/yaml dependencies. No source credentials are required for these checks.

## Remaining release checks

Browser QA of the skills-first pages was run locally on 2026-09-18 (desktop plus a 390px phone viewport):
home specimen tabs, catalog search and empty state, skill detail (portable docs visible, Engine reference
collapsed), lesson-reuse example, and quickstart. Public GitHub Pages deployment still depends on pushing
the generated `site/` to `main`. Verify the exact published commit and public routes after that deploy.
Keep this record and the release tracker current. The 2026-09-17 site was 27 pages; the lesson-reuse example
adds a 28th.

## 2026-09-18 launch addendum

Added after the 2026-09-17 record, still before public Pages deploy:

- `ask-aftergrid`, a user-invoked router over the collection (Matt Pocock `ask-matt` analog). It names one next skill and stops; it does not nest user-invoked skills.
- Worked example for the onboarding causal-overclaim case (`docs/examples/causal-claim.md`), already present in the skills lab and fieldnote.
- Catalog, plugin, package, docs “Where it fits” map links, and generated site rebuilt from those sources.

The 2026-09-17 installer copy check did not include `ask-aftergrid`. Plugin validate and site generation are the checks for that skill until a later installer copy is recorded. Owner gates (PR approvals, Reader study, entity, custom domain, headline pick) remain owner-owned.

