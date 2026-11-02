#!/usr/bin/env node
// Audit committed production pages without a browser or a network connection.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SITE=resolve(ROOT,'site');
const pages=JSON.parse(readFileSync(resolve(SITE,'content/generated-pages.json'),'utf8'));
const errors=[];
const decode=x=>x.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>');
for(const page of pages){
 const full=resolve(SITE,page),html=readFileSync(full,'utf8');
 if(!html.startsWith('<!doctype html>')&&!html.startsWith('<!DOCTYPE html>'))errors.push(`${page}: missing doctype`);
 if(!/<html[^>]+lang="en"/.test(html)) errors.push(`${page}: missing document language`);
 if(!/<meta name="viewport"/.test(html)) errors.push(`${page}: missing responsive viewport`);
 if((html.match(/<h1(?:\s|>)/g)||[]).length!==1)errors.push(`${page}: expected exactly one h1`);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 if(new Set(ids).size!==ids.length)errors.push(`${page}: duplicate element ids`);
 if(html.includes('patrickjmorris.github.io'))errors.push(`${page}: retired github.io URL`);
 if(page!=='example-finding/index.html'&&!html.includes('name="robots" content="noindex"')){
  const route=page.replace(/index\.html$/,'');
  if(!html.includes(`<link rel="canonical" href="https://aftergrid.dev/${route}">`))errors.push(`${page}: canonical is not on aftergrid.dev`);
  if(!html.includes('<meta property="og:image" content="https://aftergrid.dev/assets/social-card.png">')||!html.includes('<meta name="twitter:card" content="summary_large_image">'))errors.push(`${page}: missing social card tags`);
 }
 if(html.includes('Content is being prepared.'))errors.push(`${page}: unbuilt source placeholder`);
 for(const match of html.matchAll(/\b(href|src)="([^"]+)"/g)){
   const url=decode(match[2]);
   if(/^(mailto:|data:|https?:|tel:)/.test(url)) {
     const prefix='https://github.com/patrickjmorris/aftergrid/';
     if(url.startsWith(prefix)&&/^(blob|tree)\/main\//.test(url.slice(prefix.length))) {
       const repoPath=url.slice(prefix.length).replace(/^(blob|tree)\/main\//,'').split('#')[0].split('?')[0];
       if(!existsSync(resolve(ROOT,decodeURIComponent(repoPath))))errors.push(`${page}: missing repository link ${repoPath}`);
     }
     continue;
   }
   if(url.startsWith('/')){errors.push(`${page}: absolute path breaks relative routing: ${url}`);continue;}
   const [target,hash]=url.split('#');
   let path=target?resolve(dirname(full),decodeURIComponent(target.split('?')[0])):full;
   if(path!==SITE&&!path.startsWith(SITE+'/')){errors.push(`${page}: link escapes site: ${url}`);continue;}
   if(existsSync(path)&&statSync(path).isDirectory())path=resolve(path,'index.html');
   if(!existsSync(path)){errors.push(`${page}: broken local link ${url}`);continue;}
   if(hash&&extname(path)==='.html'){
    const targetHtml=path===full?html:readFileSync(path,'utf8');
    if(!targetHtml.includes(`id="${decodeURIComponent(hash)}"`))errors.push(`${page}: missing anchor ${url}`);
   }
 }
 for(const match of html.matchAll(/<img\b[^>]*>/g)) if(!/\balt=/.test(match[0]))errors.push(`${page}: image missing alt text`);
 for(const match of html.matchAll(/aria-controls="([^"]+)"/g))if(!ids.includes(match[1]))errors.push(`${page}: missing controlled panel ${match[1]}`);
}
if(!existsSync(resolve(SITE,'assets/social-card.png')))errors.push('Missing assets/social-card.png');
const catalog=JSON.parse(readFileSync(resolve(SITE,'content/skills.json'),'utf8'));
if(catalog.length<1||new Set(catalog.map(x=>x.slug)).size!==catalog.length)errors.push('Skill catalog must contain unique skills.');
for(const skill of catalog){for(const path of [`skills/${skill.slug}/SKILL.md`,`skills/${skill.slug}/agents/openai.yaml`,`docs/skills/${skill.slug}.md`])if(!existsSync(resolve(ROOT,path)))errors.push(`Missing skill source ${path}`);}
const example=readFileSync(resolve(SITE,'example-finding/index.html'));
const canonical=readFileSync(resolve(ROOT,'fixtures/instance/analytics/findings/2026-07-20-onboarding-checklist-retention/render/finding.html'));
if(!example.equals(canonical))errors.push('Example Finding has drifted from canonical renderer output.');
if(errors.length){console.error(`Site audit failed (${errors.length}):\n${errors.map(x=>'  '+x).join('\n')}`);process.exitCode=1;}else console.log(`Site audit passed: ${pages.length} pages, ${catalog.length} skill sources, local navigation, repository links, document structure and canonical Finding.`);
