#!/usr/bin/env python3
from pathlib import Path
import hashlib,zipfile,sys
root=Path(__file__).resolve().parents[1]
outdir=root/'dist'; outdir.mkdir(exist_ok=True)
name='youtube-speed-studio_1.0.0.zip'; out=outdir/name
exclude_prefixes=('.git/','.github/','scripts/','dist/')
exclude_names={'PROJECT_DATA.md'}
files=[]
for p in root.rglob('*'):
    if not p.is_file(): continue
    rel=p.relative_to(root).as_posix()
    if rel in exclude_names or any(rel.startswith(x) for x in exclude_prefixes): continue
    files.append((rel,p))
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for rel,p in sorted(files): z.write(p,rel)
sha=hashlib.sha256(out.read_bytes()).hexdigest()
(outdir/(name+'.sha256')).write_text(f'{sha}  {name}\n',encoding='utf-8')
print(out)
print(sha)
