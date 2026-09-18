# aftergrid site

The skills library, examples, guides and fieldnotes at <https://patrickjmorris.github.io/aftergrid/>.
Plain static HTML, local Geist typography, shared CSS and small progressive enhancements. All reading and
navigation work without JavaScript. JavaScript adds copy buttons, skill filtering and the home example selector.

## Edit and build

```sh
node scripts/build-site.mjs
node scripts/build-site.mjs --check
node scripts/audit-site.mjs
node --test tests/site.test.mjs
```

Run from the repository after installing dependencies. The builder uses the existing `marked` and `yaml`
packages; it needs no browser, network connection, environment secret or platform-specific tool. Output is
byte-stable and committed so GitHub Pages can serve it directly.

- `content/skills.json`: catalog summaries, stages, suggested prompts and outputs.
- `docs/skills/<name>.md`: skill detail-page bodies. Invocation is read from each `skills/<name>/SKILL.md`.
- `docs/guides/quickstart.md`: `/start/`.
- `docs/guides/skill-workflows.md`: `/guides/skill-workflows/`.
- `docs/examples/*.md`: the three worked example pages.
- `docs/fieldnotes/*.md`: the three essays.
- `assets/site.css`, `assets/site.js`: shared presentation and progressive interactions.
- `scripts/build-site.mjs`: page templates and route map.

Content pages accept YAML `title`, `description`, and optional `kicker`. Write source-relative Markdown links;
known content pages resolve to the local site route, while repository source links resolve to GitHub. Do not
add a body H1: the template supplies the page title. The builder adds stable heading anchors. Paths are relative
so every production page works under the `/aftergrid/` GitHub Pages project base and a local server root.

`example-finding/index.html` is copied byte-for-byte from the synthetic onboarding fixture's canonical
`render/finding.html`. Its own renderer labels are preserved. The new NYC journey links to real repository
artifacts and run logs; neither real Finding is described as publication-approved. Home diagrams use the
explicitly synthetic `examples/skills-lab` data. Prompts are suggestions, never fabricated model transcripts.

## Verification and deployment

`content/generated-pages.json` lists the production pages. The offline audit checks every local page/asset link,
repository source path, fragment target, skill source, single-H1 structure, image alt text and the canonical
Finding copy. The build check detects source/output drift. CI runs both through the site test file on pull
requests and before a Pages deployment on `main`; source content and template changes trigger the workflow.
CI also checks the synthetic teaching arithmetic and reruns all four saved Python calculations against their
recorded JSON. This checks reproducibility of recorded evidence; it does not launch another model trial.

Visual layout and browser behavior still require a browser check at desktop, tablet and phone widths. The
offline audit does not claim to measure clipping, contrast, or runtime interactions.

## Historical explorations

`explorations/landing-directions.html` and `explorations/aftergrid-landing.html` are preserved as the earlier
design exploration. They are no longer the production source or maintained as current product documentation.
The September 2026 skills-first redesign uses a multipage content model instead of extracting one of seven
landing-page variants from a browser DOM. Historical routes are excluded from the production audit.
