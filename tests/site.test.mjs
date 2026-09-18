import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));

test('production site exactly matches its Markdown and catalog sources',()=>{
 const output=execFileSync(process.execPath,['scripts/build-site.mjs','--check'],{cwd:root,encoding:'utf8'});
 assert.match(output,/Verified .* deterministic site files/);
});

test('production navigation, skill sources and canonical example remain intact',()=>{
 const output=execFileSync(process.execPath,['scripts/audit-site.mjs'],{cwd:root,encoding:'utf8'});
 assert.match(output,/Site audit passed/);
});

test('GitHub Pages routes stay inside the project and drafts remain visibly labeled',()=>{
 const home=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
 const detail=readFileSync(new URL('../site/skills/diagnose-change/index.html',import.meta.url),'utf8');
 assert.match(home,/Synthetic lab data · suggested prompts, not a model transcript/);
 assert.match(home,/Draft Findings · not publication-approved/);
 assert.match(detail,/href="\.\.\/\.\.\/start\/"/);
 assert.match(detail,/data-copy="[^"]+--skill diagnose-change"/);
 assert.match(detail,/docs\/skills\/diagnose-change.md|skills\/diagnose-change\/SKILL.md/);
 assert.doesNotMatch(home,/Content is being prepared/);
});
