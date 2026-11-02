---
title: What runs where
description: Which skills need only a CSV, which one needs the Engine, and what was checked in each agent.
kicker: Guide
---

Thirteen of the fourteen skills need no Engine, Instance, manifest, or CLI. A CSV is enough for the ones that work from data. `setup-aftergrid` is the one skill that needs the Engine, because setting it up is its job.

## By skill

<!-- runs-where-table -->

"Optional" means the skill has an Engine path you only reach by asking for a Finding or supplying a Finding directory. That path needs the complete aftergrid toolkit, which a single installed skill doesn't include. "None" means the skill doesn't use the Engine. "Who starts it" comes from each skill's frontmatter.

## By agent

Checked on 2026-11-02 with `skills` 1.7.4, in new scratch projects, running each agent headless. These results show what was installed and loaded on that date. They don't show how well any agent does the analysis.

| | Claude Code 2.1.312 | Codex CLI 0.165.0 | Cursor |
| --- | --- | --- | --- |
| Where `npx skills add --agent` put the files | `.claude/skills/` | `.agents/skills/` | `.agents/skills/` |
| Install prompt below | Worked | Failed in the `workspace-write` sandbox (`EPERM` on `.agents/`); worked with full access | Not run; `cursor-agent` wasn't signed in |
| Explicit-only skill (`grill-question`) | Left out of the agent's skill list; `/grill-question` loaded it | Left out when the agent listed skills it could use on its own; `$grill-question` loaded it | Not run |
| Agent-started skill (`analysis-review`) | In the agent's skill list; `/analysis-review` returned nothing in headless mode, so ask in plain language | The agent reported it could use it on its own | Not run |
| Skills that allow both (`diagnose-change`) | In the agent's skill list; `/diagnose-change` loaded it | The agent reported it could use it on its own | Not run |

For Cursor, only the file copy was checked. Other agents the installer supports weren't checked.

The installer also writes `skills-lock.json` to the project. Each skill it copies holds `SKILL.md`, a small `agents/openai.yaml`, and any `references/`. Files that land in a project aren't proof that an agent read them.

## Install prompt

Paste this into your agent:

```text
Install the aftergrid analytics skills into this project.

Run this, replacing <agent> with claude-code, codex, or cursor, whichever you are:

npx skills add patrickjmorris/aftergrid --skill diagnose-change make-the-call --agent <agent> --yes

Then list every file and directory the command created, and say whether I need to restart you before the skills appear. Do not run the skills or change anything else.
```

If your agent's sandbox blocks the write, run the command yourself in a terminal.

## Claude Code plugin

```text
/plugin marketplace add patrickjmorris/aftergrid
/plugin install aftergrid@aftergrid
```

This installs all fourteen skills. Checked on 2026-11-02 with the matching `claude plugin marketplace add` and `claude plugin install` commands, from GitHub, in a clean config directory; the interactive `/plugin` menu wasn't run. Claude Code reported the plugin enabled with 14 skills. Loaded with `--plugin-dir`, `/diagnose-change` and `/aftergrid:diagnose-change` both worked in headless mode.

The plugin doesn't install the Engine's packages, so the Engine CLI still needs a checkout.
