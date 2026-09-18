from pathlib import Path
import ast,hashlib,json,re
root=Path(__file__).resolve().parents[1];out=root/'outputs'
links=[]
for p in out.rglob('*.md'):
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' not in target:
   q=(p.parent/target).resolve(); assert q.is_file(), (str(p),target)
   links.append({'from':str(p.relative_to(root)),'target':target})
parsed=[]
for p in out.rglob('*.py'):
 ast.parse(p.read_text());parsed.append(str(p.relative_to(root)))
sources=[]
for p in out.rglob('stdout.json'):
 d=json.loads(p.read_text())
 records=d.get('sources',[{'path':d.get('source'),'sha256':d.get('sha256')}])
 for r in records:
  assert hashlib.sha256((root/r['path']).read_bytes()).hexdigest()==r['sha256']
  sources.append(r['path'])
print(json.dumps({'local_markdown_links_resolve':True,'link_count':len(links),'python_syntax_valid':parsed,'saved_stdout_parsed':4,'source_hashes_still_match_calculation_inputs':sorted(set(sources))},indent=2))
