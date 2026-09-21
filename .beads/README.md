# Beads Issue Tracking

Issue tracking for this repo via [Beads](https://github.com/steveyegge/beads) (`br` CLI). Issues live locally in `.beads/issues.jsonl`, which is ignored by Git. The tracker may contain private planning: never force-add it or mirror its contents wholesale to GitHub. Publish only individually reviewed, public-safe engineering issues.

## Commands

```bash
br ready                          # Find unblocked work
br create "title" -t task -p 2    # Create issue (types: bug, feature, task, epic, chore)
br list                           # List all issues
br show <id>                      # View issue details
br update <id> --status in_progress
br close <id> --reason "Done"
br sync --flush-only              # Export the local tracker (ignored by Git)
```

## Graph-Aware Triage (bv)

```bash
bv --robot-triage     # Ranked recommendations, quick wins, blockers
bv --robot-next       # Single top pick + claim command
bv --robot-plan       # Parallel execution tracks
```

## Priorities

| Priority | Meaning                                       |
| -------- | --------------------------------------------- |
| 0        | Critical (security, data loss, broken builds) |
| 1        | High                                          |
| 2        | Medium (default)                              |
| 3        | Low                                           |
| 4        | Backlog                                       |

## Agent Workflow

1. `br ready` to find unblocked work
2. `br update <id> --status in_progress` to claim
3. Trunk by default; branch only when the user requests a PR or a risky, schema, or architectural change needs isolation
4. Implement + test
5. `br close <id>` when done
6. Keep tracker data local; commit only public-safe source and documentation changes

## Learn More

- [github.com/steveyegge/beads](https://github.com/steveyegge/beads)

## Multi-checkout rules (read before writing)

Several checkouts on this machine write this same `issues.jsonl` from separate SQLite caches.

- `br sync --import-only` before you flush; `br sync --flush-only` after. Never `--force` past the stale-DB export guard.
- Never `br sync --rebuild` with un-flushed local changes (it drops DB-only rows).
- Comment ids / child ids are per-DB autoincrement → the merged JSONL can carry collisions that make every import fail with `PRIMARY KEY constraint failed`. `pnpm check:beads` (pre-commit + CI) reports them; repair = renumber the newer comments above the global max, then re-import.
- Broken local cache: back up, move `beads.db*` aside, `br sync --import-only`.
- Closed beads are never deleted for size: `br delete` only tombstones, and any checkout still holding a row re-adds it on flush. Evidence stays in this file.
- Tracking bead: `spot_sports-v61k7i.49` (store hygiene, br upgrade path).
