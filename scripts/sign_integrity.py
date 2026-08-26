#!/usr/bin/env python3
from pathlib import Path
import argparse,base64,hashlib,json,re,subprocess,tempfile,uuid
ROOT=Path(__file__).resolve().parents[1]
EXCLUDE_PREFIXES=('.git/','.github/','scripts/','dist/','.Ray_Chen/','security-staging/','private-auth/')
EXCLUDE_NAMES={'PROJECT_DATA.md','integrity-lock.json','.gitignore'}
AUTH_NAME='YTSS_AI_CHANGE_AUTHORIZATION.md'
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
        if rel==AUTH_NAME or 'AI_CHANGE_AUTHORIZATION' in rel.upper(): raise SystemExit('authorization credential must never exist inside repository')
        if rel in EXCLUDE_NAMES or any(rel.startswith(x) for x in EXCLUDE_PREFIXES): continue
        out.append((rel,p))
    return sorted(out)
def private_pem_from_md(path):
    text=path.read_text(encoding='utf-8')
    m=re.search(r'-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----',text,re.S)
    if not m: raise SystemExit('private key block not found in authorization markdown')
    return m.group(0)+'\n'
def pinned_fingerprint():
    text=(ROOT/'integrity-guard.js').read_text(encoding='utf-8')
    m=re.search(r"PUBLIC_KEY_FINGERPRINT_SHA256 = '([0-9a-f]{64})'",text)
    if not m: raise SystemExit('pinned public-key fingerprint missing')
    return m.group(1)
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--authorization-file',required=True);ap.add_argument('--counter',required=True,type=int);args=ap.parse_args()
    auth=Path(args.authorization_file).resolve(); root=ROOT.resolve()
    if root==auth.parent or root in auth.parents: raise SystemExit('authorization file must remain outside repository')
    if args.counter<1: raise SystemExit('counter must be >=1')
    pem=private_pem_from_md(auth)
    with tempfile.TemporaryDirectory() as td:
        key=Path(td)/'key.pem';key.write_text(pem,encoding='utf-8')
        pub_der=subprocess.check_output(['openssl','pkey','-in',str(key),'-pubout','-outform','DER'])
        fpr=hashlib.sha256(pub_der).hexdigest()
        if fpr!=pinned_fingerprint(): raise SystemExit('authorization key does not match pinned verifier fingerprint')
        version=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))['version']
        entries=[]
        for rel,p in package_files():
            b=p.read_bytes(); entries.append({'path':rel,'size':len(b),'gitBlobSha1':gitsha(b)})
        payload={'schemaVersion':1,'product':'youtube-speed-studio','version':version,'authorizationCounter':args.counter,'buildId':str(uuid.uuid4()),'fileIdentityAlgorithm':'git-blob-sha1+size','files':entries}
        message=canonical(payload).encode('utf-8'); msg=Path(td)/'payload.bin';sig=Path(td)/'sig.bin';msg.write_bytes(message)
        subprocess.run(['openssl','dgst','-sha256','-sign',str(key),'-out',str(sig),str(msg)],check=True)
        doc={'schemaVersion':1,'payload':payload,'signature':{'algorithm':'RSASSA-PKCS1-v1_5/SHA-256','keyFingerprintSha256':fpr,'valueBase64':base64.b64encode(sig.read_bytes()).decode()}}
        (ROOT/'integrity-lock.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(f'signed {len(entries)} packaged files for {version}; counter={args.counter}; fingerprint={fpr}')
if __name__=='__main__': main()
