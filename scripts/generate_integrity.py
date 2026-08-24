#!/usr/bin/env python3
from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1]
exclude_prefixes=('.git/','.github/','scripts/','dist/')
exclude_names={'PROJECT_DATA.md','integrity.json'}
files=[]
for p in sorted(root.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(root).as_posix()
    if rel in exclude_names or any(rel.startswith(prefix) for prefix in exclude_prefixes): continue
    files.append(rel)
entries=[]
for rel in files:
    p=root/rel
    entries.append({'path':rel,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':p.stat().st_size})
canonical=json.dumps({'owner':'Ray20123315','repository':'Ray20123315/youtube-speed-studio','version':'1.0.0','files':entries},ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
fingerprint=hashlib.sha256(canonical).hexdigest()
payload={
 'schemaVersion':1,
 'product':'youtube-speed-studio',
 'version':'1.0.0',
 'owner':'Ray20123315',
 'repository':'Ray20123315/youtube-speed-studio',
 'officialSource':'https://github.com/Ray20123315/youtube-speed-studio',
 'license':'LicenseRef-youtube-speed-studio-Proprietary-1.0',
 'fingerprint':fingerprint,
 'algorithm':'SHA-256',
 'note':'Tamper-evident official-build manifest. Client-side verification cannot technically prevent a determined party from modifying code; the proprietary license controls permitted use, modification, and redistribution.',
 'files':entries
}
(root/'integrity.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(fingerprint)
