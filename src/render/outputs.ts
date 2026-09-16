// Preflight and stage a render as a set. Never truncate source evidence or leave a partially updated set
// after a recoverable write/rename error. This is a single-writer operation, not a cross-process lock.
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { safePath, fail } from '../../scripts/fixture-safety.mjs';

export function writeOutputs(dir: string, manifest: any, outputs: [string, Buffer][], instanceRoot?: string) {
  // The render directory is owned by the renderer; evidence cannot live in it (including old previews).
  const sources = [
    'manifest.yaml', 'memo.md', ...manifest.snapshot.inputs.map((x: any) => x.path),
    ...manifest.queries.map((x: any) => x.path), ...manifest.results.map((x: any) => x.path),
    ...manifest.checks.map((x: any) => x.path), ...manifest.charts.map((x: any) => x.spec_path),
  ];
  for (const source of sources) if (/^render(?:\/|$)/i.test(source)) {
    fail('path_collision', source, 'source evidence cannot be stored in the generated render directory');
  }
  const renderDir = safePath(dir, 'render');
  for (const def of manifest.definitions) if (instanceRoot) {
    const path = safePath(instanceRoot, def.path).toLowerCase();
    if (path === renderDir.toLowerCase() || path.startsWith(renderDir.toLowerCase() + '/')) {
      fail('path_collision', def.path, 'a pinned definition cannot be stored in the generated render directory');
    }
  }
  const destinations = new Map<string, { path: string; bytes?: Buffer }>(outputs.map(([rel, bytes]) => [rel, { path: safePath(dir, rel), bytes }]));
  // Remove stale chart previews, including PNGs on a subsequent render without --png. Otherwise an
  // export-policy change can leave previously exported values in files beside the new safe HTML.
  if (existsSync(renderDir)) for (const name of readdirSync(renderDir)) {
    if (/\.(svg|png)$/.test(name)) {
      const rel = `render/${name}`;
      if (!destinations.has(rel)) destinations.set(rel, { path: safePath(dir, rel), bytes: undefined });
    }
  }
  for (const { path } of destinations.values()) if (existsSync(path) && !lstatSync(path).isFile()) {
    fail('unsafe_path', path, 'generated output must be a regular file');
  }
  const stage = mkdtempSync(join(dir, '.render-stage-'));
  const replaced: { path: string; backup?: string; installed: boolean }[] = [];
  let cleanup = true;
  try {
    let n = 0;
    for (const { bytes } of destinations.values()) { if (bytes !== undefined) writeFileSync(join(stage, `new-${n}`), bytes); n++; }
    mkdirSync(renderDir, { recursive: true });
    n = 0;
    for (const { path, bytes } of destinations.values()) {
      const state = { path, backup: undefined as string | undefined, installed: false };
      replaced.push(state);
      if (existsSync(path)) { const backup = join(stage, `old-${n}`); renameSync(path, backup); state.backup = backup; }
      if (bytes !== undefined) { renameSync(join(stage, `new-${n}`), path); state.installed = true; }
      n++;
    }
  } catch (error) {
    try {
      for (const { path, backup, installed } of replaced.reverse()) {
        if (installed) rmSync(path);
        if (backup) renameSync(backup, path);
      }
    } catch (restoreError) {
      cleanup = false; // Never delete backups when recovery itself failed.
      throw new AggregateError([error, restoreError], `render update failed; recovery files retained at ${stage}`);
    }
    throw error;
  } finally { if (cleanup) rmSync(stage, { recursive: true, force: true }); }
}
