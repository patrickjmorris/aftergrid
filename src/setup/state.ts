// Resumable setup state. One small JSON file inside the Instance, listed in the generated .gitignore: it records
// which steps a previous run actually completed, so a rerun after a fixed dependency continues instead of
// starting from nothing.
//
// The file is a record of history, never a substitute for checking. Every cheap verifying step runs again on a
// rerun and the report says what it found *this* time; only the smoke run, which builds and renders a throwaway
// Finding, is skipped when a previous run completed it. Nothing is ever reported as verified because this file
// says it once was.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
// @ts-ignore: shared path containment.
import { safePath } from "../../scripts/fixture-safety.mjs";
import type { Problem } from "../report.ts";

export const SETUP_STATE_FILE = ".aftergrid-setup.json";
export const STEPS = ["scaffold", "dependencies", "connection", "hook", "publication_preflight", "smoke"] as const;
export type StepName = (typeof STEPS)[number];
export type StepStatus = "completed" | "incomplete" | "skipped";
export type StepRecord = { status: StepStatus; at: string; detail?: string };
export type SetupState = { schema_version: string; updated_at: string; steps: Partial<Record<StepName, StepRecord>> };

export const emptyState = (): SetupState => ({ schema_version: "0.1.0", updated_at: "", steps: {} });

/**
 * Read the previous run's state. A missing file is the ordinary first run. A file that cannot be parsed is
 * reported and treated as no state at all: a rerun then redoes everything, which is safe, because every step is
 * idempotent and nothing is overwritten.
 */
export function readSetupState(instanceRoot: string): { state: SetupState; problems: Problem[] } {
  const path = join(instanceRoot, SETUP_STATE_FILE);
  if (!existsSync(path)) return { state: emptyState(), problems: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.steps !== "object" || !parsed.steps) throw new Error("not a setup state object");
    const steps: SetupState["steps"] = {};
    for (const name of STEPS) {
      const raw = (parsed.steps as any)[name];
      if (raw && typeof raw === "object" && (raw.status === "completed" || raw.status === "incomplete" || raw.status === "skipped")) {
        steps[name] = { status: raw.status, at: typeof raw.at === "string" ? raw.at : "", detail: typeof raw.detail === "string" ? raw.detail : undefined };
      }
    }
    return { state: { schema_version: String(parsed.schema_version ?? "0.1.0"), updated_at: String(parsed.updated_at ?? ""), steps }, problems: [] };
  } catch (e) {
    return {
      state: emptyState(),
      problems: [{
        category: "invalid_artifact", location: path,
        message: `the setup state file could not be read (${(e as Error).message}); this run starts from nothing and redoes every step`,
        remedy: "delete the file if it is corrupt; it holds no information that cannot be rebuilt by rerunning setup",
      }],
    };
  }
}

/** Written through a temp file in the same directory, so a reader never sees a half-written state. */
export function writeSetupState(instanceRoot: string, state: SetupState): string {
  const path = safePath(instanceRoot, SETUP_STATE_FILE) as string;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, path);
  return path;
}
