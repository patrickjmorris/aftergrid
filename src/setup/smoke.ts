// The end-to-end smoke: does this scaffold actually carry a Finding from `new` through `check` to a rendered
// draft? It runs in a throwaway copy of the scaffolded Instance, never in the Operator's own tree — the real
// Instance is left holding the scaffold and nothing else, with no `setup-smoke` Finding to delete afterwards.
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import { newFinding } from "../commands/new-finding.ts";
import { check } from "../commands/check.ts";
import { render } from "../commands/render.ts";
import type { Report } from "../report.ts";
import { SETUP_STATE_FILE } from "./state.ts";

export const SMOKE_SLUG = "setup-smoke";

export type SmokeResult = {
  /** True when all three commands ran and none reported an error. */
  passed: boolean;
  steps: { command: "new" | "check" | "render"; ok: boolean; summary: string }[];
  /** Where the throwaway copy lived, for the report. It is deleted before this returns. */
  workspace: string;
  info: string[];
  failures: string[];
};

const summarise = (r: Report): string =>
  `syntax ${r.syntax}, content ${r.content}, evidence ${r.evidence}, sql ${r.sql_execution}, publication ${r.readiness}` +
  (r.errors.length ? `; errors: ${r.errors.map((e) => `${e.category} at ${e.location}: ${e.message}`).join("; ")}` : "");

/**
 * Copy the scaffold (not the Findings, not the retained inputs, not the setup state), then run the three
 * commands against the copy. A failure is reported as what failed, never as a passed smoke.
 */
export async function runSmoke(instanceRoot: string, opts: { date?: string; now?: () => Date } = {}): Promise<SmokeResult> {
  const workspace = mkdtempSync(join(tmpdir(), "ag-setup-smoke-"));
  const root = join(workspace, basename(instanceRoot) || "analytics");
  const result: SmokeResult = { passed: false, steps: [], workspace, info: [], failures: [] };
  try {
    cpSync(instanceRoot, root, {
      recursive: true,
      dereference: false,
      filter: (src) => {
        const rel = relative(instanceRoot, src);
        if (!rel) return true;
        const parts = rel.split(sep);
        if (parts[0] === SETUP_STATE_FILE) return false;
        // The scaffold's own `findings/` is copied; any Finding inside it is not. The smoke needs an empty
        // collection, and copying a real Finding's retained inputs would be slow and pointless.
        if (parts[0] === "findings" && parts.length > 1 && parts[1] !== ".gitkeep") return false;
        return true;
      },
    });

    const now = opts.now ?? (() => new Date());
    const date = opts.date ?? now().toISOString().slice(0, 10);
    const created = newFinding({ slug: SMOKE_SLUG, ask: "Smoke test written by `aftergrid setup`; this Finding lives in a temporary copy and is deleted.", instanceDir: root, date, now });
    result.steps.push({ command: "new", ok: created.errors.length === 0, summary: summarise(created) });
    if (created.errors.length) {
      result.failures.push(`new finding failed: ${summarise(created)}`);
      return result;
    }
    const dir = join(root, "findings", `${date}-${SMOKE_SLUG}`);

    // github: null keeps the smoke offline: a scaffold check must not depend on the network, and readiness
    // therefore stays `unknown`, which is the honest answer for a Finding nobody has reviewed.
    const checked = await check({ dir, mode: "artifact", github: null });
    result.steps.push({ command: "check", ok: checked.errors.length === 0, summary: summarise(checked) });
    if (checked.errors.length) result.failures.push(`check failed: ${summarise(checked)}`);

    const rendered = await render({ dir });
    result.steps.push({ command: "render", ok: rendered.errors.length === 0, summary: summarise(rendered) });
    if (rendered.errors.length) result.failures.push(`render failed: ${summarise(rendered)}`);

    result.passed = result.failures.length === 0;
    if (result.passed) {
      result.info.push(`smoke: \`new finding ${SMOKE_SLUG}\` -> \`check\` -> \`render\` all ran in a temporary copy of this scaffold. The draft checked as ${checked.content}/${checked.evidence} and rendered as a labelled draft (publication ${rendered.readiness}); the copy has been deleted and your Instance holds only the scaffold.`);
    }
  } catch (e) {
    result.failures.push(`the smoke run could not complete: ${(e as Error).message}`);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  return result;
}
