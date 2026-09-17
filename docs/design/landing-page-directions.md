# Landing page directions (2026-09-15)

Options for the aftergrid landing page, built to be chosen from, not shipped. Interactive explorer: `site/explorations/landing-directions.html` (six layouts, ten swappable component slots, a decision sheet that produces a paste-back summary). Research reports behind this file are summarised in "Research" below.

Brand inputs: navy `#142440` on ice `#E9F0FA`, Geist ExtraBold wordmark, corner-bracket symbol. Vocabulary from `CONTEXT.md` (Finding, Claim, Check, Snapshot, Revisit, Operator, Reader; never report/memo/insight/KPI/dashboard-as-deliverable/refresh/monitor).

## What the page has to do

- Name the problem in the first screen: numbers travel SQL → sheet → slide → Slack and lose their query; analysis has no standard practice; the deliverable is a dashboard nobody decides from; "is that still true?" costs a week.
- Show the deliverable. The Finding is the product (ADR 0001); the example Finding in `fixtures/` is the product shot. Nothing invented, nothing retouched.
- Serve two readers: the Operator (installs, runs in Claude Code) and the Reader (decides, reads on a phone).
- Show trust as separate facts, never one badge or a confidence number.
- Be honest about pre-release: no stars, no logos, no testimonials. Proof = the artifact, the open spec, the build trail.

## Tech recommendation

Static HTML + CSS, one file per page, Geist via Google Fonts (or self-hosted OFL files), no framework, no build. The explorer already uses this stack; the chosen direction can be extracted from it by deleting the switcher. Host on GitHub Pages or Vercel static. Add a second page only for "Read the example Finding", which is the real `render/finding.html` from the fixture, served as-is.

## The six layouts (ordered by recommendation)

| | Direction | Thesis | Hero | Best for | Risk |
|---|---|---|---|---|---|
| A | **Document** | The Finding is the hero | Headline left; the real Finding in a browser frame with three numbered pins and a legend; paper stack behind | Understanding the product by looking at one artifact | Dense above the fold on phone |
| B | **Collage** | Spatial, not stacked | Centred headline, then hi-fi artifacts (SQL window, CSV, spreadsheet, screenshot, slide, Slack) wired with dashed lines; the Finding at the end of the only solid line; blueprint grid; fig. captions | Page must feel designed, not templated | More to maintain; collage must stay honest |
| C | **Manifesto** | Typography carries it | 100px headline with the last word marked, big-line argument, then the Finding read as an essay | Pre-release page with a point of view | Reads as opinion, not product |
| D | **Two readers** | Operator and Reader in one screen | Terminal beside phone, joined by one line | Both personas find themselves immediately | Two proofs compete |
| E | **Before / after** | Problem first | Copy-paste chain crossed out → one Finding | Audience that feels the pain daily | "Before" reads as a competitor diagram |
| F | **Terminal first** | Speaks to the Operator | Install chip, real `check` session, source ↔ render, checks table | GitHub traffic, developer credibility | Reader and deliverable underplayed |

Default composition per layout is recorded in the explorer; every slot can be swapped and mixed across layouts. A **Surface** toggle (plain / faint blueprint grid with corner markers and § section marks) applies to any layout.

## Component slots and variants

| Slot | Variants | Notes |
|---|---|---|
| Nav | minimal (Docs · Spec · GitHub · example) / install chip / bare + pre-release tag | Install chip only once npm publish exists |
| Hero | Finding as hero (paper stack behind) / Finding full-width centred / collage + Finding / layered revisions / typographic (last word marked) / Operator → Reader split / before-after chain / terminal | Collage and chain show the problem; doc variants show the deliverable; layered revisions shows "re-checks itself" |
| Headline (9) | re-checks · SQL→Slack · still true? · read/inspect · not dashboards · plain · knows where · evidence · beyond sheet | Registers: mechanism, problem, outcome, contrarian, descriptive |
| Problem | copy-paste chain (scene) / scattered artifacts collage / three gaps / forty dashboards / analysis rots / big lines (manifesto) | Scene copy beats slogan copy; the copy-paste framing is unowned in the market |
| Finding anatomy | hover to trace / figure with leader-line labels / annotated six sections / source ↔ render / section list | Source ↔ render is the only variant that shows the `{{ref}}` mechanism |
| How it works | operator steps (4 commands) / reader outcome (3) / two lanes | Two lanes is the honest one: two people, one document |
| Trust | five separate facts / badge-vs-facts / checks table / label strip / mono ticker band | Badge-vs-facts is the most memorable; checks table the most credible to Operators |
| Revisit | revision diff / stacked revisions / decision-log board / terminal | Diff is the literal "re-checks itself" |
| Open source | engine / instance boxes / repo tree / blurb | Engine/Instance is the positioning; tree is the proof it is just files |
| CTA | install + example / star + spec / waitlist / read the Finding | Pre-npm: star + spec or read the Finding |

## Decision, revised (2026-09-17): skills are the launch surface

The owner judged that the nine skills carry more utility than the Finding as a headline, so the page now leads with them. New default direction **A · Skills**: hero is a faithful `/analyze` run shown stage by stage (clarify → /checked-analysis → /write-finding → /iterate-visual → /shape-narrative → /analysis-review → aftergrid check) under "Your agent can write SQL. These skills make it do analysis."; then the nine skills as cards split by who invokes them (four user-invoked, five model-invoked), each linking to its docs page; then install (Claude Code plugin from a checkout, CLI from a tarball, Codex-style `agents/openai.yaml`), stated honestly as pre-npm and pre-marketplace; then the problem collage, the Finding as "what the skills produce", Checks tied to /checked-analysis, the decision log, engine/instance, and an install CTA. The Collage direction is kept as B.

## Decision (2026-09-16), superseded above

Chosen: **Collage** (now direction A in the explorer), plain surface, Geist for the Finding. Composition: minimal nav → collage hero with "Five tools. One number. No trail." → labelled figure → two lanes → Checks table → decision-log board → engine / instance → "Read the Finding" CTA. Built as a static page at `site/index.html` (no JavaScript except popover placement). The number popovers were redesigned as a light provenance card: value and its arithmetic, then saved result → query → snapshot → definition with a status per step, the SQL, and the memo token. `aftergrid render` itself now emits the same popover on every resolved token (CSS only, keyboard and touch reachable; see `docs/contracts/render.md`), and `site/example-finding/` is real renderer output rather than the hand-authored reference, so the linked Finding does what the page says it does. The example renders in Geist: the fixture Instance sets `render.font: { preset: geist }` and the renderer embeds the vendored variable font (`fonts/geist`, SIL OFL); any Instance can bring its own files the same way.

## Recommendation (superseded by the decision above)

Start from **A (Document)** or **B (Collage)**. A's default composition now is: pinned Finding hero → scattered-artifacts problem → hover-to-trace → two lanes → badge-vs-facts → stacked revisions → engine/instance → install CTA. B swaps the hero for the collage and the anatomy for the labelled figure. Both share the same component system. Headline: run the tested line ("The analysis that re-checks itself.") against the problem-led "Is that number still true?"; both are short and neither uses a banned word. Keep the page to six sections and roughly two and a half screens. Light theme only for the shipped site; dark reads as the dev-tool cliché and the Reader persona trusts light.

Reasons: every source studied (Biome, Bun, PostHog, Quarto, Evidence) got the most credibility from showing the output rather than the UI; aftergrid's output is a document, so the document is the screenshot. A/B testing headlines is cheap; testing layouts is not.

## Third pass: what moved the pages from 6/7 to the reference bar

- One idea per screen. Section headers are a two-column head (headline left, one-sentence lead right, bottom-aligned), never headline + paragraph + component copy.
- Scale. Display type 68 to 108px at -0.045em tracking and .96 line-height; section padding 112px; a 1160px container.
- The product shot is a browser frame with a real URL bar, not a bordered card. Pins on the frame edge with a numbered legend beneath.
- Hi-fi artifacts in the collage: window chrome, line numbers, a formula bar with column letters, a Keynote-style slide with the big number, a Slack message with reactions and thread line.
- Depth by role: paper stack behind the hero document, layered shadow, radial glow. Nothing else gets a shadow.
- Tokens for everything that flips in dark mode (button, mark, pin, terminal, tip) so the light page never inherits a dark override.
- Variant controls are off by default; the first impression is the page.

## Research

Mobbin references that drove the second pass (why the first pass read flat: everything was a stacked rectangle, no depth, no spatial composition, no annotation):
- [Ramp, "Systems that never spoke"](https://mobbin.com/sites/sections/b5b16367-0324-4627-87db-791011ccde93): scattered real artifacts wired with hairlines. Basis for the collage hero and problem section.
- [Linear, document with fig. labels](https://mobbin.com/sites/sections/ac08f1c7-d536-4996-91cc-85da059dcade) and [Rains, product with leader-line callouts](https://mobbin.com/sites/sections/0c9ca7d4-3523-44f2-93cf-ee3137acc9d7): basis for the anatomy figure.
- [ReadMe, faint blueprint grid with mono labels](https://mobbin.com/sites/sections/6f579ab9-de76-40fe-aac5-06d5891ba595) and [Reducto](https://mobbin.com/sites/sections/962f4563-2dbe-4876-8944-1805c15b2608): basis for the grid surface and § markers.
- [Strut, stacked cards with depth](https://mobbin.com/sites/sections/b874a81a-f2b2-4c67-8e76-a09d00c392d2) and [Loom](https://mobbin.com/sites/sections/189f78b7-1682-4541-83cc-d1357c18be34): basis for the paper stack and layered revisions.
- [Superpower, mono ticker of test names](https://mobbin.com/sites/sections/f337149a-0772-46fc-b4bf-028ef73a0fd6): basis for the Checks ticker.
- [Ditto, highlighted word in headline](https://mobbin.com/sites/sections/74f2a8a6-5b4f-4590-8ae1-7a9ae2231aa5) and [Kalstore](https://mobbin.com/sites/sections/ebd881f0-19d0-4472-902b-368227ecfb81): basis for the marked last word in the typographic hero.
- [Zaro, before / with table](https://mobbin.com/sites/sections/fdeeb984-a737-44e1-8752-4d44ee8cec46), [Vizcom ✗/✓ columns](https://mobbin.com/sites/sections/8e366fff-c7d7-4507-8825-41521a460209), [V7 before/after](https://mobbin.com/sites/sections/17e4b22d-7c8d-45ff-a87c-47b61b089da6): confirm the crossed-out chain pattern.
- [Symbolic, "Accurate. Transparent. Verified." with document + sources panel](https://mobbin.com/sites/sections/9ae537c0-4eb7-4806-9331-5ec4dba518ce): closest existing page to the source ↔ render idea.

Full reports (scratchpad, not committed): OSS dev-tool pages (24 sites), data/analytics tool pages (30 sites), copy and structure rules (Shapiro, Harry Dry, Wes Kao, Rob Hope, plus Linear, Tuple, HEY, Basecamp, Superhuman, Once).

Patterns worth reusing:
- Output as product shot: Biome's rendered diagnostic, Bun/Vitest terminal, PostHog's Q&A transcript, Quarto's doc-as-hero. Fits aftergrid exactly.
- Install command as hero CTA with one secondary link (Bun, Astro, tldraw, Effect). Only after npm publish.
- GitHub as the secondary CTA; the button is the licence signal (Zed "Clone source", Biome, Vitest).
- Quantified claim with its source per section (Oxc, Astro's HTTP Archive chart). Matches "every number traced".
- Mental-model section naming the unit of value (Effect's type signature, Drizzle's schema flow). For aftergrid: "a Finding".
- Honest caption on a real artifact (Elementary: "Yes, this is a real lineage graph").
- Re-run diff (SQLMesh plan mode): same document, new data, deltas and re-evaluated checks.
- Metabase's "inspect the query behind every answer" as a feature line, not a headline.

Measured references: tldraw 1024px container / 672px prose, h1 48px w600 lh .94 tracking -0.96px; shadcn h1 48px semibold tracking-tighter, 896px; Drizzle 920px column, 14px body; Effect 1180px, 15px body; Hono tagline 18/28px w500. Section rhythm 96px desktop / 64px mobile; 8px base.

Anti-patterns: chat-box hero; abstract node art and gradients; fictional data under a "trust every number" claim; logo walls or SOC2 as primary trust pre-launch; 12 to 25 sections; single "Verified" badge; "Get started" buttons (use call-to-value); headline about feelings ("drowning in data") instead of tools and moments; hype words (unlock, supercharge, 10x, AI-powered, agentic, seamless, effortless, single source of truth, actionable insights, democratize, self-serve, north star).

## Unresolved questions

- Headline locked to "Five tools. One number. No trail."; keep "The analysis that re-checks itself." as the line under test elsewhere?
- CTA before npm publish: star + spec, or waitlist?
- `aftergrid revisit` shown as a command on the page though it is v0.1: label "coming" or omit?
- Finding document face on the page: Geist or serif? (explorer toggle)
- Hosted tier planned? Drives CTA 4 and the "no hosted yet" line.
- Dark mode on the shipped site: skip?
- Domain and GitHub org for links?
