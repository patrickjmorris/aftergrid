# aftergrid site

Static landing page. No build step.

- `index.html` – the landing page (chosen direction: Skills; the Collage direction is kept in the explorer as B). Generated from the explorer; edit the explorer and rebuild, or edit this file directly once the explorer is retired.
- `example-finding/index.html` – the example Finding, copied verbatim from `fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention/render/finding.html`.
- `explorations/landing-directions.html` – the direction explorer (six layouts, swappable components, decision sheet). Design record: `docs/design/landing-page-directions.md`.

Deployed by `.github/workflows/pages.yml` (GitHub Pages, source = GitHub Actions, folder = `site/`).
