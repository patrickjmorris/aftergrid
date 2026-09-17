// ag-exemplar-render-current: every committed exemplar render IS what `aftergrid render` writes today.
//
// A committed `render/finding.html` is a claim about the renderer's current output, and it was checked nowhere
// outside publication (`verifyGeneratedOutputs`, which only runs when something is published). So an exemplar
// could sit with the wording of an older manifest — the named-operands bead changed the onboarding exemplar's
// manifest and left its committed page behind, and nothing said so until a later bead happened to regenerate it.
// This test says so on every run, for every exemplar that commits a render.
//
// Determinism (docs/contracts/render.md):
//   * `generated_at` comes from the pinned manifest, never the clock, so no `generatedAt` is passed here: the
//     committed bytes and the fresh ones both carry `manifest.finding.generated_at`.
//   * The font is the Instance's own choice, not the machine's. The fixture Instance sets
//     `render.font: { preset: geist }`, which embeds `fonts/geist` from this repo as a data: URI. The test
//     renders the Instance it copied, so it always renders under the same preset the committed files used, and
//     nothing depends on the fonts installed locally.
//   * `renderer.version` / `renderer.house_style_version` are pinned in the manifest. Bumping the running
//     versions in `src/render/charts.ts` without re-pinning changes the page (it gains a draft-preview label),
//     and this test fails — the remedy is `scripts/repin-renderer.mjs` and then a re-render.
//   * Each exemplar renders in its OWN process. Vega numbers SVG def ids from a process-global counter, and a
//     fresh `aftergrid render` is exactly one render per process; that is the numbering the committed files hold.
//     (Publication's in-process check calls `resetSVGDefIds()` to buy the same thing.)
//
// Platform caveat for CI (ubuntu-latest and macos-latest, `.github/workflows/ci.yml`): HTML and chart SVG are
// strings produced by this repo's code and the pinned Vega build from committed inputs, so they are expected to
// be byte-identical on both. Nothing is normalised here to make that true — a difference is a real difference.
// PNG previews are deliberately NOT compared byte for byte: a PNG is rasterized by `@resvg/resvg-wasm`, whose
// glyph rasterization and text layout depend on the font file handed to it (`AFTERGRID_FONT` or a system lookup
// when the Instance embeds none), so identical bytes across machines are not something the renderer promises.
// No exemplar commits a PNG today — CI renders `--png` into a temp directory — and publication excludes PNGs
// from its byte check for the same reason. Should one ever be committed, this test asserts that the render
// produces it and that its pixel dimensions match, and says nothing about its bytes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const INSTANCE = join(REPO, "fixtures", "instance");
const FINDINGS = join(INSTANCE, "analytics", "findings");
/** Hand-authored reference in `render/`; not generated, so never compared (docs/contracts/publication.md). */
const AUTHORED = new Set(["finding.template.html"]);
const isGenerated = (name: string) => !AUTHORED.has(name) && (name === "finding.html" || /\.(svg|png)$/.test(name));

/** The exemplars that commit a render, in directory order. */
const committing = readdirSync(FINDINGS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(FINDINGS, e.name, "render", "finding.html")))
  .map((e) => e.name)
  .sort();

function generatedNames(renderDir: string): string[] {
  return existsSync(renderDir) ? readdirSync(renderDir).filter(isGenerated).sort() : [];
}

/** Where two text outputs first diverge, as a line number with both sides, windowed so a 200KB font line stays readable. */
function firstDifference(committed: Buffer, fresh: Buffer): string {
  const a = committed.toString("utf8").split("\n"), b = fresh.toString("utf8").split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (x === undefined) return `first difference at line ${i + 1}: the committed file ends, the render writes ${JSON.stringify(clip(y!, 0))}`;
    if (y === undefined) return `first difference at line ${i + 1}: the render ends, the committed file has ${JSON.stringify(clip(x, 0))}`;
    let col = 0;
    while (col < x.length && col < y.length && x[col] === y[col]) col++;
    return `first difference at line ${i + 1}, column ${col + 1}:\n    committed: ${JSON.stringify(clip(x, col))}\n    rendered:  ${JSON.stringify(clip(y, col))}`;
  }
  return "no line differs; the files differ only in line endings or trailing bytes";
}
const clip = (line: string, col: number) => {
  const from = Math.max(0, col - 40), text = line.slice(from, from + 160);
  return `${from > 0 ? "…" : ""}${text}${from + 160 < line.length ? "…" : ""}`;
};

/** Width and height from a PNG IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  assert.ok(bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "not a PNG");
  assert.equal(bytes.subarray(12, 16).toString("latin1"), "IHDR", "PNG does not start with IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("some exemplar commits a render, so this file actually checks something", () => {
  assert.ok(committing.length > 0, `no Finding under ${relative(REPO, FINDINGS)} commits render/finding.html; this test would pass vacuously`);
});

for (const name of committing) {
  test(`the committed render of ${name} is what render writes today`, (t) => {
    const committedDir = join(FINDINGS, name, "render");
    const committedNames = generatedNames(committedDir);
    const wantPng = committedNames.some((n) => n.endsWith(".png"));

    // Copy the whole Instance, minus the render/ directory under test: the copy must be rendered from source
    // alone, and what lands in its render/ is then exactly what the renderer writes.
    const stage = mkdtempSync(join(tmpdir(), "ag-exemplar-render-"));
    t.after(() => rmSync(stage, { recursive: true, force: true }));
    const root = join(stage, "instance");
    const skip = join("analytics", "findings", name, "render");
    cpSync(INSTANCE, root, {
      recursive: true,
      filter: (src) => {
        const rel = relative(INSTANCE, src);
        return !(rel === skip || rel.startsWith(skip + sep));
      },
    });
    const freshFinding = join(root, "analytics", "findings", name);
    const args = ["src/cli.ts", "render", freshFinding, ...(wantPng ? ["--png"] : [])];
    const remedy = `run \`node src/cli.ts render ${relative(REPO, join(FINDINGS, name))}${wantPng ? " --png" : ""}\` and commit the regenerated files`;
    const run = spawnSync(process.execPath, args, { cwd: REPO, encoding: "utf8" });
    assert.equal(run.status, 0, `\`node ${args.join(" ")}\` failed (exit ${run.status})\n${run.stdout}\n${run.stderr}`);

    const freshDir = join(freshFinding, "render");
    assert.deepEqual(generatedNames(freshDir), committedNames,
      `the generated files in ${relative(REPO, committedDir)} are not the set the renderer writes; ${remedy}`);

    for (const file of committedNames) {
      const committed = readFileSync(join(committedDir, file)), fresh = readFileSync(join(freshDir, file));
      if (file.endsWith(".png")) {
        // Bytes are not asserted: see the platform caveat at the top of this file.
        assert.deepEqual(pngSize(committed), pngSize(fresh),
          `${relative(REPO, join(committedDir, file))} has different pixel dimensions from the preview the renderer writes; ${remedy}`);
        continue;
      }
      assert.ok(committed.equals(fresh),
        `${relative(REPO, join(committedDir, file))} is not what the renderer writes today `
        + `(${committed.length} bytes committed, ${fresh.length} bytes rendered); ${remedy}.\n  ${firstDifference(committed, fresh)}`);
    }
  });
}
