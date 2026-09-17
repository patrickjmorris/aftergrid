# Skills

The Engine's skills, laid out the way `mattpocock-skills` lays its own out, because Operators install both and
the two should read the same way.

## Buckets

| Bucket | Path | What it means |
| --- | --- | --- |
| Promoted | `skills/<name>/` | Shipped. Listed in `.claude-plugin/plugin.json`, has a docs page under `docs/skills/`, and is covered by `aftergrid plugin validate`. |
| In progress | `skills/in-progress/<name>/` | Public on purpose, not shipped. Excluded from the plugin manifest and from the docs, and free to change or disappear. |
| Deprecated | `skills/deprecated/<name>/` | Retired but still readable, with the replacement named in the skill itself. |

Only the promoted bucket exists today. The other two are the destination for work that has not landed, not empty
directories kept for symmetry: `skills/in-progress/` and `skills/deprecated/` are created by the first skill that
belongs in them.

## Each promoted skill

```
skills/<name>/
  SKILL.md              # frontmatter + the procedure
  agents/openai.yaml    # the same skill for Codex-style agents
```

and a page at `docs/skills/<name>.md`. `aftergrid plugin validate` fails if any of those three is missing, or if
the manifest names a skill that is not there.

## User-invoked or model-invoked, stated twice

Every promoted skill declares who may start it, in **both** files, and the two must agree. Nothing is left to a
default: a reader of either file can tell which kind of skill this is without knowing what the default is.

| Kind | `SKILL.md` frontmatter | `agents/openai.yaml` |
| --- | --- | --- |
| User-invoked — a human types `/<name>` | `disable-model-invocation: true` | `policy.allow_implicit_invocation: false` |
| Model-invoked — the agent reaches for it mid-task | `user-invocable: false` | `policy.allow_implicit_invocation: true` |

A skill that writes files, installs a hook or spends real money is user-invoked. The invocation rule from the
design holds: no user-invoked skill calls another user-invoked skill.

## What is here, and what is not yet

Promoted:

- **[setup-aftergrid](./setup-aftergrid/SKILL.md)** — user-invoked. Collect the inputs, run `aftergrid setup`,
  read the report, name what is still missing. Docs: [docs/skills/setup-aftergrid.md](../docs/skills/setup-aftergrid.md).
- **[analyze](./analyze/SKILL.md)** — user-invoked. The only orchestrator: raw ask to reviewed Finding draft, halting with a precise reason. Docs: [docs/skills/analyze.md](../docs/skills/analyze.md).
- **[grill-question](./grill-question/SKILL.md)** — user-invoked. Interview the Operator in rounds until a raw ask is a Question, and write it into a Finding. Docs: [docs/skills/grill-question.md](../docs/skills/grill-question.md).
- **[revise-finding](./revise-finding/SKILL.md)** — user-invoked. Classify Operator feedback with `aftergrid revise`, apply presentation changes as a new revision, say what a numeric or interpretation change reopens. Docs: [docs/skills/revise-finding.md](../docs/skills/revise-finding.md).
- **[analysis-review](./analysis-review/SKILL.md)** — model-invoked. Method, Question and Reader reviewers over a complete Finding, recorded in the manifest. Docs: [docs/skills/analysis-review.md](../docs/skills/analysis-review.md).
- **[checked-analysis](./checked-analysis/SKILL.md)** — model-invoked. Probe the catalog, capture the retained inputs, write the applicable Checks before the analysis SQL, execute on the retained inputs, fill `analysis.yaml`. Docs: [docs/skills/checked-analysis.md](../docs/skills/checked-analysis.md).
- **[iterate-visual](./iterate-visual/SKILL.md)** — model-invoked. Render each chart, look at the PNG, score it against the visual rubric, revise up to three times, hand back what still fails. Docs: [docs/skills/iterate-visual.md](../docs/skills/iterate-visual.md).
- **[shape-narrative](./shape-narrative/SKILL.md)** — model-invoked. Answer first, each Evidence heading states its Claim, each chart title states its Claim, the Reader's words. Docs: [docs/skills/shape-narrative.md](../docs/skills/shape-narrative.md).
- **[write-finding](./write-finding/SKILL.md)** — model-invoked. Turn a checked Analysis directory into a Finding: memo.md in the six fixed sections, typed Claims, charts and tables, every value bound. Docs: [docs/skills/write-finding.md](../docs/skills/write-finding.md).

All nine v0 skills are promoted. The manual-Finding gate (`ag-manual-real-finding-db2`) was relaxed by the owner on
2026-09-16 so the chain could be authored on synthetic fixtures; the real Finding with real Reader feedback stays an
open owner gate for the milestone, and every skill's recorded runs say plainly that no model was in the loop.

## Installing these skills

**As a Claude Code plugin.** The manifest is `.claude-plugin/plugin.json` at the repository root and the skills
are discovered from the paths it lists. There is no marketplace entry: the plugin is installed from a local
checkout or a local tarball while the repository is private.

**With skills.sh.** `npx skills add patrickjmorris/aftergrid` installs all nine skills; `--skill <name>` picks one
and `-a <agent>` names the harness (`claude-code`, `cursor`, `codex`, and the rest skills.sh supports). The
installer discovers skills from `skills/<name>/SKILL.md` by their frontmatter `name` and `description`, so no
index file and no registration are needed. Verified 2026-09-17 on this repository: all nine copied into
`.claude/skills/` for Claude Code, and a single skill into Cursor. The `skills` array in `package.json` mirrors
the plugin manifest and `aftergrid plugin validate` fails if the two disagree.

**For Codex-style agents.** `agents/openai.yaml` sits beside each `SKILL.md` with the display name, the short
description and the invocation policy (spec story 48).
