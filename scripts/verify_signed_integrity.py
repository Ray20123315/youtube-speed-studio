#!/usr/bin/env python3
from pathlib import Path
import base64,hashlib,json,re,subprocess,tempfile
ROOT=Path(__file__).resolve().parents[1]
EXCLUDE_PREFIXES=('.git/','.github/','scripts/','dist/','.Ray_Chen/','security-staging/','private-auth/')
EXCLUDE_NAMES={'PROJECT_DATA.md','integrity-lock.json','.gitignore'}
def canonical(v):
    if isinstance(v,list): return '['+','.join(canonical(x) for x in v)+']'
    if isinstance(v,dict): return '{'+','.join(json.dumps(k,separators=(',',':'))+':'+canonical(v[k]) for k in sorted(v))+'}'
    return json.dumps(v,separators=(',',':'),ensure_ascii=False)
def gitsha(b): return hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()
def package_files():
    out=[]
    for p in ROOT.rglob('*'):
        if not p.is_file(): continue
        rel=p.relative_to(ROOT).as_posix()
        if 'AI_CHANGE_AUTHORIZATION' in rel.upper(): raise SystemExit('private authorization material detected inside repository')
        if rel in EXCLUDE_NAMES or any(rel.startswith(x) for x in EXCLUDE_PREFIXES): continue
        raw=p.read_bytes()
        if b'-----BEGIN PRIVATE KEY-----\n' in raw or b'-----BEGIN RSA PRIVATE KEY-----\n' in raw: raise SystemExit('private key material detected inside repository: '+rel)
        out.append((rel,p))
    return sorted(out)
def guard_key():
    text=(ROOT/'integrity-guard.js').read_text(encoding='utf-8')
    b=re.search(r"PUBLIC_KEY_SPKI_BASE64 = '([^']+)'",text); f=re.search(r"PUBLIC_KEY_FINGERPRINT_SHA256 = '([0-9a-f]{64})'",text)
    if not b or not f: raise SystemExit('pinned key missing')
    der=base64.b64decode(b.group(1)); actual=hashlib.sha256(der).hexdigest()
    if actual!=f.group(1): raise SystemExit('pinned key fingerprint mismatch')
    return der,actual
def main():
    doc=json.loads((ROOT/'integrity-lock.json').read_text(encoding='utf-8')); payload=doc['payload']; sig=base64.b64decode(doc['signature']['valueBase64']);der,fpr=guard_key()
    if doc['signature']['keyFingerprintSha256']!=fpr: raise SystemExit('signature fingerprint mismatch')
    if payload['version']!=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))['version']: raise SystemExit('version mismatch')
    with tempfile.TemporaryDirectory() as td:
        pub=Path(td)/'pub.pem';msg=Path(td)/'payload.bin';sf=Path(td)/'sig.bin'
        body=base64.b64encode(der).decode();pub.write_text('-----BEGIN PUBLIC KEY-----\n'+'\n'.join(body[i:i+64] for i in range(0,len(body),64))+'\n-----END PUBLIC KEY-----\n')
        msg.write_bytes(canonical(payload).encode('utf-8'));sf.write_bytes(sig)
        r=subprocess.run(['openssl','dgst','-sha256','-verify',str(pub),'-signature',str(sf),str(msg)],capture_output=True,text=True)
        if r.returncode!=0: raise SystemExit('signature verification failed')
    expected={e['path']:e for e in payload['files']}; actual_files={r:p for r,p in package_files()}
    if set(expected)!=set(actual_files):
        raise SystemExit('package inventory mismatch: missing='+str(sorted(set(expected)-set(actual_files)))+' extra='+str(sorted(set(actual_files)-set(expected))))
    failures=[]
    for rel,p in actual_files.items():
        b=p.read_bytes();e=expected[rel]
        if len(b)!=e['size'] or gitsha(b)!=e['gitBlobSha1']: failures.append(rel)
    if failures: raise SystemExit('file identity mismatch: '+', '.join(failures))
    print(f"signed integrity PASS: {len(expected)} files; version={payload['version']}; counter={payload['authorizationCounter']}; fingerprint={fpr}")
if __name__=='__main__': main()
