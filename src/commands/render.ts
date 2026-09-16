// `aftergrid render <finding-dir>`: validated source -> SVG charts (+ optional PNG previews) -> one reader-safe HTML.
// Refuses when evidence is invalid. A draft renders with a truthful draft label and the same projection.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { checkArtifact } from "./check.ts";
// @ts-ignore: shared helpers.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import { type Report } from "../report.ts";
import { findInstance } from "../instance.ts";
import { writeOutputs } from "../render/outputs.ts";
import { loadResults } from "../render/values.ts";
import { renderHtml } from "../render/html.ts";
import { RENDERER_VERSION, HOUSE_STYLE_VERSION, svgToPng } from "../render/charts.ts";
import { resolveFont } from "../render/fonts.ts";

export type RenderOptions = { dir: string; png?: boolean; generatedAt?: string };

export async function render(opts: RenderOptions): Promise<Report> {
  const dir = resolve(opts.dir);
  const report: Report = { ...checkArtifact({ dir, mode: "artifact" }), command: "render" };
  if (report.errors.length) {
    report.info.push("render refused: the source must verify before anything is generated; previous outputs left untouched");
    return report;
  }
  try {
    const manifest: any = parseYaml(readFileSync(safePath(dir, "manifest.yaml"), "utf8"));
    if (manifest.renderer.version !== RENDERER_VERSION || manifest.renderer.house_style_version !== HOUSE_STYLE_VERSION) {
      const message = `pinned renderer ${manifest.renderer.version} / house style ${manifest.renderer.house_style_version} differs from running renderer ${RENDERER_VERSION} / house style ${HOUSE_STYLE_VERSION}; this output is a draft preview, not a reproduction by the pinned renderer`;
      report.warnings.push({ category: "render_error", location: "manifest.yaml#/renderer", message });
      report.readiness = "not_ready"; report.readiness_reasons.push(message);
    }
    const instance = findInstance(dir);
    let readerLabel = manifest.reader.profile === "generic" ? "Generic non-data decision maker" : manifest.reader.profile;
    if (instance && manifest.reader.profile !== "generic") {
      const readers = readFileSync(safePath(instance.root, "readers.md"), "utf8");
      const m = new RegExp(`^## ${manifest.reader.profile}\\s*$[\\s\\S]*?label:\\s*(.+)$`, "m").exec(readers);
      if (m) readerLabel = m[1]!.trim();
    }
    const font = resolveFont(instance);
    const results = loadResults(dir, manifest);
    const memo = readFileSync(safePath(dir, "memo.md"), "utf8");
    const { html, svgs } = await renderHtml({ dir, manifest, results, memo, readiness: report.readiness, readinessReasons: report.readiness_reasons, content: report.content, readerLabel, generatedAt: opts.generatedAt, font });
    const marker = manifest.export_policy.private_marker;
    const outputs: [string, Buffer][] = [["render/finding.html", Buffer.from(html, "utf8")], ...Object.entries(svgs).map(([id, svg]) => [`render/${id}.svg`, Buffer.from(svg, "utf8")] as [string, Buffer])];
    if (opts.png) for (const [id, svg] of Object.entries(svgs)) {
      const { png, font: rasterFont } = await svgToPng(svg, 960, font.rasterFont);
      outputs.push([`render/${id}.png`, png]);
      if (!rasterFont) report.warnings.push({ category: "render_error", location: `render/${id}.png`, message: "no TrueType font found for the WASM rasterizer; chart text is missing from the PNG preview (set AFTERGRID_FONT to a .ttf). The SVG is unaffected." });
    }
    for (const [rel, bytes] of outputs) {
      if (marker && bytes.includes(marker)) { report.errors.push({ category: "export_policy", location: rel, message: "private marker would be exported; nothing written" }); return report; }
    }
    writeOutputs(dir, manifest, outputs, instance?.root);
    report.info.push(`wrote ${outputs.map(([rel]) => rel).join(", ")}`);
    report.info.push(`font: ${font.description}`);
    if (report.readiness !== "ready") report.info.push("rendered as a draft: no verified publication approval");
  } catch (e) {
    report.errors.push({ category: e instanceof ContractError ? (e as any).category : "render_error", location: e instanceof ContractError ? String((e as any).location) : dir, message: (e as Error).message });
    report.readiness = "not_ready";
  }
  return report;
}
