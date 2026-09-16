#!/usr/bin/env node
// The `aftergrid` bin. The package ships TypeScript sources and no build output: on Node 22.18+ and 24+ type
// stripping is on by default, so `src/cli.ts` is imported directly. There is no compile step, and installing the
// package runs no build script.
//
// This launcher is plain JavaScript on purpose. An older Node cannot parse a `.ts` entry point at all, and the
// error it prints ("Unknown file extension \".ts\"") says nothing about what to do. Reaching this file first
// means an unsupported runtime gets the version and the fix instead.
const RAW = process.versions.node;
const m = /^(\d+)\.(\d+)\./.exec(RAW);
const major = m ? Number(m[1]) : 0;
const minor = m ? Number(m[2]) : 0;

// Where type stripping is on by default: 22.18+ on the 22 line, 23.6+ on the 23 line (untested here), 24+.
const stripsTypes = major >= 24 || (major === 22 && minor >= 18) || (major === 23 && minor >= 6);

if (!m || !stripsTypes) {
  process.stderr.write(
    `aftergrid needs Node 22.18 or newer on the 22 line, or Node 24 or newer. This is Node ${RAW}.\n` +
      `The package ships TypeScript sources and is executed by Node's built-in type stripping, which is off by\n` +
      `default before those versions, so there is nothing to fall back to and no build step to run.\n` +
      `Fix: install a supported Node (nvm: \`nvm install 24\`) and run \`aftergrid\` again.\n`,
  );
  process.exit(2);
}

// Node does not strip types under node_modules, so an installed copy needs the load hook in strip-types.mjs.
// Importing it registers the hook; the dynamic import of the CLI below then happens after it exists.
const { result } = await import("./strip-types.mjs");
if (!result.registered) {
  process.stderr.write(`aftergrid cannot start: ${result.reason}\n`);
  process.exit(2);
}

const { main } = await import("../src/cli.ts");
await main(process.argv.slice(2));
