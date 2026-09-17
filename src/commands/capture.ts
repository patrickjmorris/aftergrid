// `aftergrid capture <finding-dir> --tables a,b [--catalog] [--json]`
//
// Turns the Instance's live source into this Finding's retained inputs: whole-table extracts under `inputs/`, with
// content hashes and honest source metadata recorded in `manifest.yaml#/snapshot/inputs` (ADR 0008).
// After this runs, every later step — `aftergrid execute`, `check --mode rerun` — reads the extracts and never
// the source again.
//
// `capture` copies WHOLE tables. There is no window, predicate or row-bound option anywhere in the command, the
// adapter contract or the CLI, and the recorded `source.method` says so (`select * from <table> …`). Bounding a
// read to the analytical window happens in the analysis SQL, which converts to the analytical timezone
// explicitly; it never happens here.
//
// Six refusals, none of them overridable from a flag:
//   - An Instance with no adapter. That is the recorded path (ADR 0010) and the default: there is no source to
//     copy from, and the refusal names `aftergrid record` rather than a connection to fix.
//   - A table the planner puts over the Instance's admission limit. Because the read is the whole table, the cap
//     that bounds `execute` bounds `capture` too; every named table is admitted before the first byte is read, so
//     a refusal leaves the Finding exactly as it was. The remedy is the windowed-Instance pattern
//     (docs/contracts/adapters.md), never a narrower capture.
//   - `--catalog` reads the catalog and writes nothing at all, so a plan can be checked against the columns that
//     actually exist — and against each table's scan rows, bytes and admissibility — before any table is copied.
//   - A revision carrying attestations is refused. Retained inputs are inside the content digest, so capturing
//     into an approved revision would silently invalidate the approval; the answer is a new revision.
//   - The manifest's `attestations` and `reviews` are never read for rebinding and never written.
//   - A `--description` that describes the extract as bounded, filtered or limited is refused. The description
//     is provenance inside the content digest, and the one thing it may not do is claim a bound the capture did
//     not apply.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDocument } from "yaml";
import { emptyReport, type Problem, type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { ESTIMATE_CAP_REMEDY, openInstanceAdapter } from "../analysis/source.ts";
import { AdapterError, type Adapter, type RetainedInput, type TableAdmission } from "../adapters/contract.ts";
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

/**
 * Phrases that assert a bound on the rows captured. `--description` REPLACES the adapter's honest default
 * ("Whole-table extract of <table> …"), so text like these would put a filter that never ran inside the content
 * digest, where every later reader takes it for provenance. Deliberately narrow: it matches claims about the
 * extract's extent, not a description that merely names the analytical window the SQL applies.
 */
const BOUND_CLAIM = /\b(bounded|bounding|prefiltered|pre-filtered|filtered (?:to|down|by)|limited to|restricted to|clipped to|truncated to|trimmed to|narrowed to|subset of|only the rows|rows? between|either side of the window)\b/i;

/**
 * The one answer to a source too large to capture whole — the windowed-Instance pattern
 * (docs/contracts/adapters.md, "Large sources: the windowed Instance pattern"). It is a remedy and not a flag on
 * purpose: the bounded table is the Operator's artifact, built by the Operator's script beside the Instance, so
 * the narrowing is a visible, provenanced step rather than something capture did silently inside the digest.
 *
 * Where the bounded table goes is the one part that differs per backend, so it is read off the adapter rather
 * than assumed: a Postgres Instance has no DuckDB file to write into, and telling its Operator to build one
 * would be a remedy they cannot follow.
 */
const largeSourceRemedy = (adapter: Adapter["name"]): string =>
  (adapter === "postgres"
    ? "build a bounded table for this Question as a table in the schema this Instance reads, built by your own job "
      + "(a daily/zone aggregate or a windowed extract), outside aftergrid, "
    : "build a bounded table for this Question in the Instance's own DuckDB file (a daily/zone aggregate or a windowed extract), "
      + "outside aftergrid, ")
  + "with a provenance table naming source, bytes, hash and build time; then capture that table. "
  + "The analytical window still lives in SQL. See docs/contracts/adapters.md, \"Large sources: the windowed Instance pattern\", "
  + "and `aftergrid capture <finding-dir> --catalog` to see each table's scan rows and whether it is admissible before copying anything.";

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

  // An Instance with no adapter is on the recorded path (ADR 0010), which is the default: there is no source
  // for capture to copy from, and the route that does exist is named here rather than left to be inferred from
  // "not a supported adapter".
  const adapterName = String((instance.config as any)?.connection?.adapter ?? "");
  if (adapterName === "" || adapterName === "none") {
    err("recorded_path", "aftergrid.yaml#/connection/adapter",
      `this Instance configures no adapter (${adapterName === "" ? "no connection.adapter" : "connection.adapter: none"}), so there is no source to capture from; nothing was read and nothing was written`,
      `on the recorded path your harness runs the query and \`aftergrid record <finding-dir> --tool "<name>" --execution <id> --result <file>\` writes down the SQL, the parameters, the result and the tool that produced them — the Finding then guarantees artifact_replay. To capture retained inputs instead, set \`connection.adapter\` in ${join(instance.root, "aftergrid.yaml")} to duckdb or postgres with its block; setup never overwrites that file, so run \`aftergrid setup --adapter duckdb --duckdb-path <file-or-csv-dir>\` (or \`--adapter postgres --pg-url-env <ENV_VAR_NAME>\`) to print the block and paste it in yourself.`);
    return report;
  }

  let opened: { adapter: ReturnType<typeof openInstanceAdapter>["adapter"]; description: string };
  try {
    opened = openInstanceAdapter(instance);
  } catch (e) {
    // The error's own location, so a bad `estimate_cap` points at the line that holds it rather than at the block.
    err(categoryOf(e), String((e as any).location || "aftergrid.yaml#/connection"), (e as Error).message,
      /estimate_cap/.test(String((e as any).location ?? "")) ? ESTIMATE_CAP_REMEDY : "fix the Instance connection; nothing was read and nothing was written");
    return report;
  }
  const { adapter, description } = opened;
  report.info.push(`source: ${description}`);

  try {
    if (opts.catalog) {
      const tables = await adapter.catalog();
      report.info.push(`catalog: ${tables.length} table${tables.length === 1 ? "" : "s"} visible; nothing was captured and nothing was written`);
      // Per-table admission alongside the columns: `capture` copies whole tables, so whether a table can be
      // captured at all is a planner question, and this is where it is answered before anything is copied.
      const wanted = (opts.tables ?? []).filter(Boolean);
      // A `--tables` name the catalog does not hold is `unresolved_reference` here exactly as it is in a real
      // capture, where the adapter refuses it: `--catalog` exists to check a plan against the source, and a plan
      // naming a table that is not there is the thing it is for. Listing the other tables and saying nothing
      // would answer a question that was not asked. Nothing is read or written either way.
      const unknown = wanted.filter((w) => !tables.some((t) => t.name === w));
      if (unknown.length) {
        err("unresolved_reference", unknown[0]!,
          `--tables names ${unknown.join(", ")}, which ${unknown.length === 1 ? "is not a table" : "are not tables"} in the source catalog`,
          `the catalog holds ${tables.length ? tables.map((t) => t.name).join(", ") : "no tables at all"}; name one of those, or drop --tables to see every table. Nothing was read and nothing was written`);
        return report;
      }
      // `--tables` narrows the whole report, the column lines included: the plan's tables are what was asked about.
      const named = wanted.length ? tables.filter((t) => wanted.includes(t.name)) : tables;
      let admissions: TableAdmission[] = [];
      try { admissions = adapter.tableAdmissions ? await adapter.tableAdmissions(named.map((t) => t.name)) : []; }
      catch (e) { report.info.push(`per-table admission is unavailable here (${(e as Error).message}); the columns below are still what the catalog reports`); }
      const byTable = new Map(admissions.map((a) => [a.table, a]));
      for (const t of named) {
        report.info.push(`table ${t.name}: ${t.columns.map((c) => `${c.name} ${c.sql_type}`).join(", ")}`);
        const a = byTable.get(t.name);
        if (!a) continue;
        const scan = a.estimate.status === "estimated" ? `${a.estimate.scan_rows} scan rows (${a.estimate.unit})` : `scan rows unknown (${a.estimate.reason})`;
        const bytes = a.bytes === undefined ? "bytes not stated by this source" : `${a.bytes} bytes at the source`;
        if (a.admission.decision === "rejected") {
          report.info.push(`admission ${t.name}: ${scan}, ${bytes} — NOT admissible: ${a.admission.reason}`);
          report.warnings.push({ category: "admission", location: t.name, message: `a whole-table capture of ${t.name} would scan ${scan.split(" ")[0]} rows, over the admission limit; ${a.admission.reason}`, remedy: largeSourceRemedy(adapter.name) });
        } else {
          report.info.push(`admission ${t.name}: ${scan}, ${bytes} — admissible (${a.admission.basis})`);
        }
      }
      report.info.push("backend types only. Business units come from the evidence and the Metric definition, never from a SQL type (docs/contracts/adapters.md).");
      report.info.push("scan rows are the planner's estimate for `select * from <table>`, which is the read capture performs; they are a planner model, never a count.");
      report.evidence = "not_evaluated";
      report.readiness_reasons.push("catalog read: this says nothing about any Finding");
      return report;
    }

    const tables = (opts.tables ?? []).filter(Boolean);
    if (!tables.length) {
      err("incomplete", "--tables", "name the tables to capture", "pass --tables a,b — or --catalog to see which tables exist first");
      return report;
    }
    const boundClaim = opts.description ? BOUND_CLAIM.exec(opts.description) : null;
    if (boundClaim) {
      err("invalid_artifact", "--description",
        `--description says the extract is ${boundClaim[0]}, and capture applies no bound: it copies whole tables and records the read it performed in snapshot.inputs[].source.method`,
        "describe what was captured, not a filter that did not run. The analytical window belongs in the analysis SQL, which converts to the analytical timezone explicitly, and in an analysis.yaml assumption; nothing was read and nothing was written");
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
    report.info.push("each extract is a whole-table read, recorded in snapshot.inputs[].source.method; capture applies no window or row bound, and the analytical window is applied in the analysis SQL");
    report.info.push("snapshot.guarantees is unchanged: a guarantee is established by running the analysis on these inputs (`aftergrid execute`), not by capturing them");
    report.info.push("attestations and reviews were not read for rebinding and were not written");
    report.readiness_reasons.push("capture records evidence; publication readiness is decided by `aftergrid check` and a human review");
  } catch (e) {
    const category = categoryOf(e);
    // An `admission` refusal is the one failure that is about the shape of the source rather than the run, and
    // the adapter checks every table before it writes anything, so this remedy names the pattern instead of
    // offering to clean up extracts that do not exist.
    err(category, (e as any).location || dir, (e as Error).message,
      category === "admission"
        ? `${largeSourceRemedy(adapter.name)} manifest.yaml was not changed and no extract was written: admission is decided for every named table before the first byte is read.`
        : "manifest.yaml was not changed; extracts already written under inputs/ are unreferenced and safe to delete");
  } finally {
    await adapter.close().catch(() => undefined);
  }
  return report;
}

function safePathOr(root: string, rel: string): string {
  try { return safePath(root, rel) as string; } catch { return `${root}/${rel}`; }
}
