// `aftergrid new finding <slug>`: a syntactically valid, explicitly incomplete draft with fresh ids.
// Never overwrites; never invents evidence, approvals or a falsifier.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as toYaml } from "yaml";
import { mintFindingId, SLUG_RE, toId } from "../ids.ts";
import { contentDigest } from "../digest.ts";
import { findInstance, readerProfileIds, type Instance } from "../instance.ts";
import { emptyReport, type Report } from "../report.ts";

export type NewFindingOptions = {
  slug: string;
  ask?: string;
  reader?: string;
  instanceDir?: string;
  date?: string;      // yyyy-mm-dd, defaults to today (UTC)
  now?: () => Date;   // injectable for tests
};

const SECTIONS = ["Answer", "Decision it informs", "Evidence", "How we checked", "What would change our mind", "Appendix"];

export function draftMemo(findingId: string, title: string): string {
  const body = SECTIONS.map((s) => `## ${s}\n\n_Not written yet._\n`).join("\n");
  return `---\nfinding: ${findingId}\nrevision: 1\n---\n\n# ${title}\n\n${body}`;
}

export function draftManifest(opts: { id: string; slug: string; title: string; ask: string; reader: string; instance: Instance; generatedAt: string; canonical: string }) {
  const owner = opts.instance.config.owner ?? {};
  const exp = opts.instance.config.export_defaults ?? {};
  return {
    schema_version: "0.1.0",
    finding: {
      id: opts.id, revision: 1, slug: opts.slug, title: opts.title,
      state: "draft", outcome: "pending", generated_at: opts.generatedAt, canonical_location: opts.canonical,
    },
    owner: { name: owner.name ?? "unknown", contact: owner.contact ?? "unknown@example.invalid" },
    reader: { profile: opts.reader },
    question: { id: toId(opts.slug), raw_ask: opts.ask, state: "unresolved", unresolved: ["decision", "metric", "population", "window", "falsifier", "primary_comparison"] },
    snapshot: { id: "snap_" + toId(opts.slug).slice(0, 58), inputs: [], guarantees: [] },
    definitions: [], queries: [], executions: [], results: [], derived: [], external_sources: [],
    claims: [], charts: [], tables: [], checks: [], reviews: [], attestations: [],
    export_policy: { recipient_scope: exp.recipient_scope ?? "owner_only", granularity: exp.granularity ?? "aggregate_only", allowed_fields: [], delivery: "html_file" },
    coverage: { data_from: "1970-01-01", data_to: "1970-01-01", description: "Not determined yet. No data has been read." },
    renderer: { version: "0.0.0", house_style_version: "0.1.0" },
    content_digest: { algorithm: "sha256", value: "0".repeat(64) },
  };
}

export function newFinding(opts: NewFindingOptions): Report {
  const report = emptyReport("new");
  const err = (category: Report["errors"][number]["category"], location: string, message: string, remedy?: string) => report.errors.push({ category, location, message, remedy });
  if (!SLUG_RE.test(opts.slug)) { err("syntax", "slug", `'${opts.slug}' is not a slug`, "use lowercase words separated by single hyphens"); report.syntax = "invalid"; return report; }
  const instance = findInstance(opts.instanceDir ?? process.cwd());
  if (!instance) { err("missing_file", opts.instanceDir ?? process.cwd(), "no aftergrid.yaml found here or above", "run /setup-aftergrid or pass --instance <dir>"); return report; }
  const profiles = readerProfileIds(instance);
  const reader = opts.reader ?? "generic";
  if (reader !== "generic" && !profiles.includes(reader)) { err("unresolved_reference", "reader.profile", `'${reader}' is not in ${join(instance.root, "readers.md")}`, `use one of: generic${profiles.length ? ", " + profiles.join(", ") : ""}`); return report; }
  const now = (opts.now ?? (() => new Date()))();
  const date = opts.date ?? now.toISOString().slice(0, 10);
  const dirName = `${date}-${opts.slug}`;
  const dir = join(instance.root, "findings", dirName);
  if (existsSync(dir)) { err("exists", dir, "a Finding directory with this date and slug already exists", "choose another slug, or open the existing Finding; new never overwrites"); return report; }
  const id = mintFindingId();
  const title = opts.slug.split("-").map((w, i) => (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
  const generatedAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const canonical = `${instance.config.publication?.repository ?? "instance"}/${instance.config.instance_root ?? "analytics"}/findings/${dirName}`;
  const manifest = draftManifest({ id, slug: opts.slug, title, ask: opts.ask ?? "(raw ask not recorded; pass --ask)", reader, instance, generatedAt, canonical });
  const memo = draftMemo(id, title);
  for (const sub of ["queries", "checks", "charts", "results", "inputs", "render"]) mkdirSync(join(dir, sub), { recursive: true });
  writeFileSync(join(dir, "memo.md"), memo);
  manifest.content_digest = contentDigest(manifest as never, dir, (p) => (p.endsWith("memo.md") ? Buffer.from(memo) : Buffer.alloc(0)));
  writeFileSync(join(dir, "manifest.yaml"), "# Draft created by `aftergrid new finding`. State draft, outcome pending: nothing here is evidence yet.\n" + toYaml(manifest, { lineWidth: 0 }));
  report.finding = `${id} r1`; report.state = "draft"; report.outcome = "pending";
  report.content = "incomplete";
  report.readiness_reasons.push("draft: no attestations, no Claims, Question unresolved");
  report.info.push(`created ${dir}`);
  report.info.push("next: sharpen the Question (/grill-question), add retained inputs, queries, results and Claims, then `aftergrid check`");
  return report;
}
