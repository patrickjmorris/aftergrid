# aftergrid

Open-source analytics skills for the agent someone already uses. The product is the practice: sharper questions, inspected data, checked calculations, challenged conclusions, and lessons that later work actually retrieves. The optional Engine adds typed Findings, retained evidence, and publication controls. Portable skill output is not an Engine Finding.

This file is for agents working **on** aftergrid. Product vocabulary is in [`CONTEXT.md`](CONTEXT.md). Reader-facing copy may use plain words.

## Product direction

Skills-first for the Tuesday launch. aftergrid should be the analytics counterpart to [Matt Pocock's skills](https://github.com/mattpocock/skills), [Compound Engineering](https://github.com/EveryInc/compound-engineering-plugin), and [pstack](https://github.com/cursor/plugins/tree/main/pstack): installable judgment, a short path to first use, worked examples with provenance, and teaching that names a failure mode. The Engine remains optional. Do not lead with CLI architecture, Instance layout, or publication machinery.

Ordinary skill use must not require the Engine, an Instance, GitHub approval, a manifest, or an adapter. A CSV, notebook, SQL client, or unfinished question is a valid start.

## Before you change anything

1. Read this file, then [`CONTEXT.md`](CONTEXT.md) for Engine and Instance terms.
2. Register with Agent Mail for this checkout (`/Users/patrickmorris/Sites/aftergrid`) and introduce yourself if other agents are listed.
3. Run `br ready` and `br list --status in_progress`. Claim one implementation leaf, not an epic.
4. Do not report work as verified, approved, executed, or ready unless you observed it.

## Layout

| Path | What lives there |
| --- | --- |
| `skills/<name>/SKILL.md` | The skill. Portable procedure first. Optional Engine path in `references/engine-workflow.md`. |
| `docs/skills/<name>.md` | Human docs page. Orients a person choosing the skill; does not copy the runbook. |
| `docs/guides/` | Quickstart and workflows. |
| `docs/examples/` | Worked examples that the site publishes. |
| `docs/fieldnotes/` | Teaching essays. |
| `docs/contracts/` | Engine contracts. Precision belongs here, not on the landing page. |
| `examples/skills-lab/` | Synthetic teaching cases, recorded agent outputs, verifiable arithmetic. |
| `examples/nyc-open-data/` | Real public-data analyses. Merged Findings are **not** publication-approved. |
| `site/` | Generated static site. Edit sources and rebuild; do not hand-edit production HTML. |
| `.beads/` | Local development tracker. Its issue data is private and must not be committed or mirrored wholesale. |

Fifteen promoted skills live directly under `skills/` and must appear in `skills/README.md`, `package.json#skills`, `.claude-plugin/plugin.json`, and `site/content/skills.json`. Experimental or retired skills may use `in-progress/` or `deprecated/`; those buckets are excluded from the plugin index. Do not create empty buckets for symmetry.

## Skills

Write skills the way Matt's `writing-for-agents` skill requires: ordered actions with observable completion, domain-specific decision rules, and branch detail behind references. A skill solves a problem a practicing analyst can name.

- **Portable first.** The default path uses the user's files and existing tools.
- **Engine last.** If `references/engine-workflow.md` exists, the docs page keeps Engine detail after `## Engine Finding reference` so the site can collapse it.
- **Invocation.** `ask-aftergrid`, `analyze`, `grill-question`, `revise-finding`, and `setup-aftergrid` are explicit (`disable-model-invocation: true`). The original craft skills are model-invoked (`user-invocable: false`). New skills allow both. Keep `SKILL.md` and `agents/openai.yaml` in agreement.
- **No user-invoked skill calls another user-invoked skill.** Shared procedures live in references.
- **Docs pages** use What it does, When to reach for it, a short leading-idea section, Common questions, It's working if, and Where it fits. They do not dump install commands (the site template supplies those) and they do not reproduce `SKILL.md` step lists.
- After adding, renaming, or changing a promoted skill, update its docs page, the catalog JSON, the README table, and the plugin/package skill arrays. Run `node src/cli.ts plugin validate --json`.

## Site

```sh
node scripts/build-site.mjs
node scripts/build-site.mjs --check
node scripts/audit-site.mjs
```

Sources: `docs/skills/`, `docs/guides/`, `docs/examples/`, `docs/fieldnotes/`, `site/content/skills.json`, `site/assets/`. Commit generated `site/` output with the source change. Paths are relative so GitHub Pages can serve `/aftergrid/`.

Do not claim browser QA, visual contrast, or live harness parity from the offline audit. The site test checks generation, links, and structure.

## Evidence and claims

- Synthetic labs are teaching cases. Label them.
- NYC Findings are real agent runs on public data, complete, unapproved. Do not infer owner approval from a merged PR.
- Skills-lab trial records are one isolated agent, not a benchmark win.
- Installer checks establish copied files, not runtime behavior.
- Never fabricate an attestation, approval, model transcript, or independent-reviewer identity.
- Passing Checks never by themselves make a Finding trustworthy.

## Working rules

- Stage commits by explicit path. Never `git add -A`.
- Secrets never in tracked files.
- Internal business plans, financial projections, pricing assumptions, personal circumstances, and revenue strategy stay outside the public repository. Do not commit the local tracker or mirror its private entries to GitHub. Public service descriptions and synthetic analytics examples are allowed.
- `br` only in the main checkout, never in worktrees.
- Do not touch private Instance data or Spot Sports schema, metrics, IDs, or credentials.
- Owner gates stay owner gates: PR approvals, publication identities, real Reader sessions, selling entity, outreach.
- Human publication approval is not something an agent can complete.

## Influences

Borrow specific mechanisms and credit them. Do not copy persona, command names, or unearned adoption claims. Compound Engineering's capture-and-retrieval loop and pstack's observable proof are the bars for `learn-from-analysis` and `analysis-review`. Matt's docs shape is the bar for `docs/skills/`.
