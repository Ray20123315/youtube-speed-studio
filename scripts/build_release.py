#!/usr/bin/env python3
from pathlib import Path
import hashlib,json,subprocess,sys,zipfile
root=Path(__file__).resolve().parents[1]
subprocess.run([sys.executable,str(root/'scripts'/'verify_signed_integrity.py')],check=True)
version=json.loads((root/'manifest.json').read_text(encoding='utf-8'))['version']
outdir=root/'dist';outdir.mkdir(exist_ok=True)
name=f'youtube-speed-studio_{version}.zip';out=outdir/name
exclude_prefixes=('.git/','.github/','scripts/','dist/','.Ray_Chen/','security-staging/','private-auth/')
exclude_names={'PROJECT_DATA.md','.gitignore'}
files=[]
for p in root.rglob('*'):
    if not p.is_file():continue
    rel=p.relative_to(root).as_posix()
    if 'AI_CHANGE_AUTHORIZATION' in rel.upper(): raise SystemExit('REFUSING BUILD: private authorization material detected inside repository')
    if rel in exclude_names or any(rel.startswith(x) for x in exclude_prefixes):continue
    raw=p.read_bytes()
    if b'-----BEGIN PRIVATE KEY-----\n' in raw or b'-----BEGIN RSA PRIVATE KEY-----\n' in raw: raise SystemExit('REFUSING BUILD: private key material detected in '+rel)
    files.append((rel,p))
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for rel,p in sorted(files):z.write(p,rel)
sha=hashlib.sha256(out.read_bytes()).hexdigest()
(outdir/(name+'.sha256')).write_text(f'{sha}  {name}\n',encoding='utf-8')
print(out);print(sha)
