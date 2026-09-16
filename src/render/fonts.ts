// House font for the Reader artifact. The HTML must stay self-contained (docs/contracts/render.md), so a font is
// embedded as data: URIs, never linked. Default is the system stack; an Instance may choose the shipped Geist preset
// or bring its own files. Every path is resolved inside the Instance root; nothing is fetched.
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
// @ts-ignore: shared helpers.
import { safePath, ContractError } from "../../scripts/fixture-safety.mjs";
import type { Instance } from "../instance.ts";

export const SYSTEM_STACK = "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif";
export const SYSTEM_STACK_SVG = "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif";

export type FontFile = { path: string; weight?: string | number; style?: "normal" | "italic" };
export type FontConfig = { preset?: "system" | "geist"; family?: string; files?: FontFile[]; fallback?: string };
export type ResolvedFont = {
  /** CSS font-family list for the page. */
  stack: string;
  /** The same list without quotes, for SVG text attributes. */
  svgStack: string;
  /** `@font-face` rules with embedded data: URIs; empty for the system stack. */
  faces: string;
  /** A TrueType/OpenType file the PNG rasterizer can use, when one was configured. */
  rasterFont: Buffer | null;
  /** Human-readable description for reports. */
  description: string;
};

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const FORMATS: Record<string, string> = { ".woff2": "woff2", ".woff": "woff", ".ttf": "truetype", ".otf": "opentype" };
const MIME: Record<string, string> = { ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf" };
const PRESETS: Record<string, { family: string; files: FontFile[]; root: string }> = {
  geist: { family: "Geist", root: join(REPO, "fonts", "geist"), files: [{ path: "Geist-Variable.ttf", weight: "100 900" }] },
};

export const systemFont = (): ResolvedFont => ({ stack: SYSTEM_STACK, svgStack: SYSTEM_STACK_SVG, faces: "", rasterFont: null, description: "system font stack" });

/** Resolve the Instance's font choice. Throws ContractError for a file outside the Instance root or of an unknown format. */
export function resolveFont(instance: Instance | null): ResolvedFont {
  const cfg = instance?.config.render?.font as FontConfig | undefined;
  if (!cfg || cfg.preset === "system" || (!cfg.preset && !cfg.files?.length)) return systemFont();
  let family: string, files: FontFile[], root: string;
  if (cfg.preset) {
    const p = PRESETS[cfg.preset];
    if (!p) throw new ContractError("instance_config", "aftergrid.yaml#/render/font/preset", `unknown font preset ${JSON.stringify(cfg.preset)}; use system, geist, or list files`);
    ({ family, files, root } = p);
  } else {
    if (!cfg.family) throw new ContractError("instance_config", "aftergrid.yaml#/render/font/family", "a font with files needs a family name");
    family = cfg.family; files = cfg.files!; root = instance!.root;
  }
  const fallback = cfg.fallback ?? SYSTEM_STACK;
  let rasterFont: Buffer | null = null;
  const faces = files.map((f) => {
    const ext = extname(f.path).toLowerCase();
    const format = FORMATS[ext], mime = MIME[ext];
    if (!format || !mime) throw new ContractError("instance_config", `aftergrid.yaml#/render/font/files/${basename(f.path)}`, `unsupported font format ${ext || "(none)"}; use woff2, woff, ttf or otf`);
    const bytes = readFileSync(safePath(root, f.path));
    if ((ext === ".ttf" || ext === ".otf") && !rasterFont) rasterFont = bytes;
    const weight = f.weight ? String(f.weight) : "400";
    return `@font-face { font-family: "${family.replace(/"/g, "")}"; font-style: ${f.style ?? "normal"}; font-weight: ${weight}; font-display: swap; src: url(data:${mime};base64,${bytes.toString("base64")}) format("${format}"); }`;
  }).join("\n");
  const quoted = `"${family.replace(/"/g, "")}"`;
  return { stack: `${quoted}, ${fallback}`, svgStack: `${family.replace(/"/g, "")}, ${fallback.replace(/"/g, "")}`, faces, rasterFont, description: `${family} (${cfg.preset ? `preset ${cfg.preset}` : `${files.length} file(s) from the Instance`}), embedded` };
}
