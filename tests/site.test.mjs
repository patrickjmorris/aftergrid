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
 assert.match(home,/Synthetic four-row CSV on GitHub · the 900 plan is a stated teaching assumption · panels show the target diagnosis and recommendation, not a model transcript/);
 assert.match(home,/Draft Findings · not publication-approved/);
 assert.match(detail,/href="\.\.\/\.\.\/start\/"/);
 assert.match(detail,/data-copy="[^"]+--skill diagnose-change"/);
 assert.match(detail,/docs\/skills\/diagnose-change.md|skills\/diagnose-change\/SKILL.md/);
 assert.doesNotMatch(home,/Content is being prepared/);
});

test('the maintainer is reachable from every page and the About page exists',()=>{
 const home=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
 const about=readFileSync(new URL('../site/about/index.html',import.meta.url),'utf8');
 assert.match(home,/id="work-with-me"/);
 assert.match(home,/href="about\/">Work with me</);
 assert.match(about,/<h1>Work with me<\/h1>/);
 assert.match(about,/id="consulting"/);
 assert.match(about,/id="sponsorship"/);
 assert.match(about,/mailto:patrick@sportingworks.co/);
});

test('the site lives at aftergrid.dev and shares a labeled social card',()=>{
 const home=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
 assert.match(home,/<link rel="canonical" href="https:\/\/aftergrid\.dev\/">/);
 assert.match(home,/<meta property="og:image" content="https:\/\/aftergrid\.dev\/assets\/social-card\.png">/);
 assert.match(home,/<meta name="twitter:card" content="summary_large_image">/);
 assert.match(home,/<meta property="og:image:alt" content="Synthetic teaching case:/);
 assert.match(readFileSync(new URL('../site/robots.txt',import.meta.url),'utf8'),/Sitemap: https:\/\/aftergrid\.dev\/sitemap\.xml/);
 const png=readFileSync(new URL('../site/assets/social-card.png',import.meta.url));
 assert.equal(png.readUInt32BE(16),1200);
 assert.equal(png.readUInt32BE(20),630);
 assert.match(readFileSync(new URL('../scripts/build-site.mjs',import.meta.url),'utf8'),/>Synthetic teaching case<\/text>/);
});

test('every doctrine quote matches the skill file it names',()=>{
 const doctrine=readFileSync(new URL('../docs/doctrine.md',import.meta.url),'utf8');
 const sections=doctrine.split(/^## /m).slice(1).filter(x=>x.startsWith('No '));
 assert.ok(sections.length>=5);
 for(const section of sections){
  const quotes=[...section.matchAll(/^> (.+)$/gm)].map(x=>x[1]);
  const files=[...section.matchAll(/\]\(\.\.\/(skills\/[^)]+\.md)\)/g)].map(x=>x[1]);
  assert.ok(quotes.length&&files.length,`no quote or source in: ${section.split('\n')[0]}`);
  const sources=files.map(file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8'));
  for(const quote of quotes)assert.ok(sources.some(text=>text.includes(quote)),`not in ${files.join(', ')}: ${quote}`);
 }
});

test('what-runs-where comes from the skills, and only setup-aftergrid needs the Engine',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../site/content/skills.json',import.meta.url),'utf8'));
 const page=readFileSync(new URL('../site/guides/what-runs-where/index.html',import.meta.url),'utf8');
 const readme=readFileSync(new URL('../README.md',import.meta.url),'utf8');
 const section=readme.slice(readme.indexOf('## What runs where'),readme.indexOf('## What the agent refuses'));
 for(const skill of catalog){
  const text=readFileSync(new URL(`../skills/${skill.slug}/SKILL.md`,import.meta.url),'utf8');
  assert.ok(text.includes(skill.start_source),`${skill.slug}: start_source is not in SKILL.md`);
  const cell=skill.slug==='setup-aftergrid'?'Required':/Engine (Finding|procedure|workflow|writing|mode)|Under the Engine/.test(text)?'Optional':'None';
  assert.ok(page.includes(`>${skill.slug}</a></td><td>${skill.start}</td><td>${cell}</td>`),`${skill.slug}: page row`);
  assert.ok(section.includes(`\`${skill.slug}\``),`${skill.slug}: README table`);
 }
});

test('the paste-prompt install is the same text everywhere and names no unverified result',()=>{
 const prompt=readFileSync(new URL('../scripts/build-site.mjs',import.meta.url),'utf8').match(/const PASTE_PROMPT=`([^`]+)`/)[1];
 for(const file of ['../README.md','../docs/guides/what-runs-where.md'])assert.ok(readFileSync(new URL(file,import.meta.url),'utf8').includes(prompt),file);
 assert.doesNotMatch(prompt,/verified|guarantee|works in/i);
});
