// `aftergrid capture <finding-dir> --tables a,b [--catalog] [--json]`
//
// Turns the Instance's live source into this Finding's retained inputs: bounded extracts under `inputs/`, with
// content hashes and honest source metadata recorded in `manifest.yaml#/snapshot/inputs` (ADR 0008).
// After this runs, every later step — `aftergrid execute`, `check --mode rerun` — reads the extracts and never
// the source again.
//
// Three refusals, none of them overridable from a flag:
//   - `--catalog` reads the catalog and writes nothing at all, so a plan can be checked against the columns that
//     actually exist before any table is copied.
//   - A revision carrying attestations is refused. Retained inputs are inside the content digest, so capturing
//     into an approved revision would silently invalidate the approval; the answer is a new revision.
//   - The manifest's `attestations` and `reviews` are never read for rebinding and never written.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "yaml";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { openInstanceAdapter } from "../analysis/source.ts";
import { AdapterError, type RetainedInput } from "../adapters/contract.ts";
// @ts-ignore: shared digest envelope, the one used by the fixture build and by `check`.
import { digestOf } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared path containment.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";

export type CaptureOptions = { dir: string; tables?: string[]; catalog?: boolean; instanceDir?: string; description?: string };

const KNOWN = new Set(["missing_file", "missing_credential", "runtime_unavailable", "unsafe_path", "admission", "cancelled", "resource_limit", "sql_error", "sql_policy", "sql_parameter", "hash_mismatch", "invalid_artifact", "unresolved_reference", "not_implemented"]);
const categoryOf = (e: unknown): Problem["category"] =>
  (e instanceof AdapterError || e instanceof ContractError) && KNOWN.has((e as any).category) ? ((e as any).category as Problem["category"])
  : (e as any)?.code === "ENOENT" ? "missing_file"
  : "sql_error";

/** The manifest shape `snapshot.inputs` accepts: the adapter's `runtime` field is summarised in `description`. */
function toManifestInput(input: RetainedInput) {
  return {
    id: input.id, kind: input.kind, path: input.path,
    content_hash: input.content_hash, captured_at: input.captured_at, description: input.description,
    source: { adapter: input.source.adapter, method: input.source.method, tables: input.source.tables, consistency: input.source.consistency },
  };
}

export async function capture(opts: CaptureOptions): Promise<Report> {
  const report = emptyReport("capture");
  const dir = resolve(opts.dir);
  const err = (category: Problem["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });

  if (!existsSync(safePathOr(dir, "manifest.yaml"))) {
    err("missing_file", `${dir}/manifest.yaml`, "manifest.yaml not found", "pass a Finding directory created by `aftergrid new finding`");
    report.syntax = "invalid";
    return report;
  }
  const instance = findInstance(opts.instanceDir ?? dir);
  if (!instance) {
    err("missing_file", opts.instanceDir ?? dir, "no aftergrid.yaml found here or above", "run /setup-aftergrid, or pass --instance <dir>");
    return report;
  }

  let doc: ReturnType<typeof parseDocument>;
  let manifest: any;
  try {
    doc = parseDocument(readFileSync(safePath(dir, "manifest.yaml"), "utf8"));
    manifest = doc.toJS();
    if (!manifest?.finding) throw new Error("manifest.yaml has no finding block");
  } catch (e) {
    err(categoryOf(e), "manifest.yaml", (e as Error).message, "the manifest must be readable YAML with a finding block; nothing was read from the source");
    report.syntax = "invalid";
    return report;
  }
  report.finding = manifest?.finding?.id ? `${manifest.finding.id} r${manifest.finding.revision}` : undefined;
  report.state = manifest?.finding?.state;
  report.outcome = manifest?.finding?.outcome;

  let opened: { adapter: ReturnType<typeof openInstanceAdapter>["adapter"]; description: string };
  try {
    opened = openInstanceAdapter(instance);
  } catch (e) {
    err(categoryOf(e), "aftergrid.yaml#/connection", (e as Error).message, "fix the Instance connection; nothing was read and nothing was written");
    return report;
  }
  const { adapter, description } = opened;
  report.info.push(`source: ${description}`);

  try {
    if (opts.catalog) {
      const tables = await adapter.catalog();
      report.info.push(`catalog: ${tables.length} table${tables.length === 1 ? "" : "s"} visible; nothing was captured and nothing was written`);
      for (const t of tables) report.info.push(`table ${t.name}: ${t.columns.map((c) => `${c.name} ${c.sql_type}`).join(", ")}`);
      report.info.push("backend types only. Business units come from the evidence and the Metric definition, never from a SQL type (docs/contracts/adapters.md).");
      report.evidence = "not_evaluated";
      report.readiness_reasons.push("catalog read: this says nothing about any Finding");
      return report;
    }

    const tables = (opts.tables ?? []).filter(Boolean);
    if (!tables.length) {
      err("incomplete", "--tables", "name the tables to capture", "pass --tables a,b — or --catalog to see which tables exist first");
      return report;
    }
    if ((manifest.attestations ?? []).length) {
      err("stale_attestation", "manifest.yaml#/attestations",
        `this revision carries ${manifest.attestations.length} attestation(s), and retained inputs are inside the content digest they bind to`,
        "bump finding.revision first and capture into the new revision; capture never rewrites, rebinds or drops an attestation");
      return report;
    }

    const captured = await adapter.capture(tables, dir, opts.description ? { description: opts.description } : {});
    const inputs: any[] = [...(manifest.snapshot?.inputs ?? [])];
    for (const input of captured) {
      const entry = toManifestInput(input);
      const at = inputs.findIndex((i) => i.id === entry.id);
      if (at === -1) inputs.push(entry); else inputs[at] = entry;
      report.info.push(`captured ${entry.id} -> ${entry.path} (${entry.source.consistency}, sha256 ${entry.content_hash.value.slice(0, 12)}…)`);
    }
    doc.setIn(["snapshot", "inputs"], inputs);

    const next: any = doc.toJS();
    doc.setIn(["content_digest"], digestOf(next, dir));
    writeFileSync(safePath(dir, "manifest.yaml"), doc.toString({ lineWidth: 0 }));

    report.content = manifest.finding?.state === "complete" ? "complete" : "incomplete";
    report.info.push(`snapshot.inputs now names ${inputs.length} retained input(s); the content digest was repinned`);
    report.info.push("snapshot.guarantees is unchanged: a guarantee is established by running the analysis on these inputs (`aftergrid execute`), not by capturing them");
    report.info.push("attestations and reviews were not read for rebinding and were not written");
    report.readiness_reasons.push("capture records evidence; publication readiness is decided by `aftergrid check` and a human review");
  } catch (e) {
    err(categoryOf(e), (e as any).location || dir, (e as Error).message,
      "manifest.yaml was not changed; extracts already written under inputs/ are unreferenced and safe to delete");
  } finally {
    await adapter.close().catch(() => undefined);
  }
  return report;
}

function safePathOr(root: string, rel: string): string {
  try { return safePath(root, rel) as string; } catch { return `${root}/${rel}`; }
}
