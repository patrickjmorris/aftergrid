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

Pending. These are the v0 skill set from `docs/design/v0-design-2026-09-15.md`; none of them is scaffolded here,
because they all wait on the manual-Finding gate (`ag-manual-real-finding-db2`): a hand-authored real Finding with
Reader feedback comes before any skill that writes one.

| Skill | Kind | Bead |
| --- | --- | --- |
| `/grill-question` | user-invoked | `ag-grill-checked-analysis-7qg` |
| `/checked-analysis` | model-invoked | `ag-grill-checked-analysis-7qg` |
| `/analyze` | user-invoked | `ag-review-analyze-golden-4ka` |
| `/analysis-review` | model-invoked | `ag-review-analyze-golden-4ka` |
| `/write-finding` | model-invoked | `ag-write-finding-narrative-kpc` |
| `/shape-narrative` | model-invoked | `ag-write-finding-narrative-kpc` |
| `/iterate-visual` | model-invoked | `ag-iterate-visual-revise-kn3` |
| `/revise-finding` | user-invoked | `ag-iterate-visual-revise-kn3` |

## Installing these skills

**As a Claude Code plugin.** The manifest is `.claude-plugin/plugin.json` at the repository root and the skills
are discovered from the paths it lists. There is no marketplace entry: the plugin is installed from a local
checkout or a local tarball while the repository is private.

**With skills.sh.** The installed `mattpocock-skills@1.2.3` bundle carries no `skills.json` and no index file of
any kind: its `package.json` has a `skills` array of directory paths, its `.claude-plugin/plugin.json` has the
same array, and `npx skills@latest add mattpocock/skills --skill=<name>` addresses a skill by its directory name.
So aftergrid invents no index either: it mirrors the one mattpocock-skills has, a `skills` array in
`package.json` holding the same directory paths as the plugin manifest, and `aftergrid plugin validate` fails if
the two disagree. What a skills.sh install needs from this repository is a directory under
`skills/` whose `SKILL.md` frontmatter carries `name` and `description` — which is what the table above already
requires, and what `aftergrid plugin validate` enforces. The skills.sh installer itself has not been run against
this repository; that is a maintainer step, not something verified here.

**For Codex-style agents.** `agents/openai.yaml` sits beside each `SKILL.md` with the display name, the short
description and the invocation policy (spec story 48).
