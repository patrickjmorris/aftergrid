// `aftergrid render <finding-dir>`: validated source -> SVG charts (+ optional PNG previews) -> one reader-safe HTML.
// Refuses when evidence is invalid. A draft renders with a truthful draft label and the same projection.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
// @ts-ignore: shared ESM library.
import { validateFinding } from "../../scripts/lib/validate-finding.mjs";
// @ts-ignore: shared helpers.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import { emptyReport, type Report } from "../report.ts";
import { findInstance, readerProfileIds } from "../instance.ts";
import { loadResults } from "../render/values.ts";
import { renderHtml } from "../render/html.ts";
import { svgToPng } from "../render/charts.ts";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
export type RenderOptions = { dir: string; png?: boolean; generatedAt?: string };

export async function render(opts: RenderOptions): Promise<Report> {
  const report = emptyReport("render");
  const dir = resolve(opts.dir);
  if (!existsSync(join(dir, "manifest.yaml"))) { report.errors.push({ category: "missing_file", location: dir, message: "manifest.yaml not found" }); report.syntax = "invalid"; return report; }
  const v = validateFinding(dir, { repoRoot: REPO_ROOT });
  report.errors.push(...v.errors); report.warnings.push(...v.warnings);
  if (v.errors.length) {
    report.syntax = v.errors.some((e: any) => e.category === "schema") ? "invalid" : "ok";
    report.evidence = "invalid"; report.readiness = "not_ready";
    report.info.push("render refused: the source must verify before anything is generated; previous outputs left untouched");
    return report;
  }
  const manifest: any = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8"));
  report.finding = `${manifest.finding.id} r${manifest.finding.revision}`; report.state = manifest.finding.state; report.outcome = manifest.finding.outcome;
  report.syntax = "ok"; report.evidence = "valid"; report.content = manifest.finding.state === "complete" ? "complete" : "incomplete";
  report.readiness = v.readiness ?? "not_ready"; report.readiness_reasons.push(...(v.reasons ?? []));
  const instance = findInstance(dir);
  let readerLabel = manifest.reader.profile === "generic" ? "Generic non-data decision maker" : manifest.reader.profile;
  if (instance && manifest.reader.profile !== "generic") {
    const readers = readFileSync(join(instance.root, "readers.md"), "utf8");
    const m = new RegExp(`^## ${manifest.reader.profile}\\s*$[\\s\\S]*?label:\\s*(.+)$`, "m").exec(readers);
    if (m) readerLabel = m[1]!.trim();
    void readerProfileIds;
  }
  try {
    const results = loadResults(dir, manifest);
    const memo = readFileSync(safePath(dir, "memo.md"), "utf8");
    const { html, svgs } = await renderHtml({ dir, manifest, results, memo, readiness: report.readiness, readinessReasons: report.readiness_reasons, content: report.content, readerLabel, generatedAt: opts.generatedAt });
    const marker = manifest.export_policy.private_marker;
    const outputs: [string, Buffer][] = [["render/finding.html", Buffer.from(html, "utf8")], ...Object.entries(svgs).map(([id, svg]) => [`render/${id}.svg`, Buffer.from(svg, "utf8")] as [string, Buffer])];
    if (opts.png) for (const [id, svg] of Object.entries(svgs)) {
      const { png, font } = await svgToPng(svg);
      outputs.push([`render/${id}.png`, png]);
      if (!font) report.warnings.push({ category: "render_error", location: `render/${id}.png`, message: "no TrueType font found for the WASM rasterizer; chart text is missing from the PNG preview (set AFTERGRID_FONT to a .ttf). The SVG is unaffected." });
    }
    for (const [rel, bytes] of outputs) {
      if (marker && bytes.includes(marker)) { report.errors.push({ category: "export_policy", location: rel, message: "private marker would be exported; nothing written" }); return report; }
    }
    mkdirSync(join(dir, "render"), { recursive: true });
    for (const [rel, bytes] of outputs) writeFileSync(safePath(dir, rel), bytes);
    report.info.push(`wrote ${outputs.map(([rel]) => rel).join(", ")}`);
    if (report.readiness !== "ready") report.info.push("rendered as a draft: no verified publication approval");
  } catch (e) {
    report.errors.push({ category: e instanceof ContractError ? (e as any).category : "render_error", location: e instanceof ContractError ? String((e as any).location) : dir, message: (e as Error).message });
    report.evidence = "invalid";
  }
  return report;
}
