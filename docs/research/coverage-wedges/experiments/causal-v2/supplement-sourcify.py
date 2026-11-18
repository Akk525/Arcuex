"""Supplement immutable library code from Sourcify; preserve third-party provenance."""
import datetime
import hashlib
import json
from pathlib import Path
import urllib.request
base=Path(__file__).parent
state=json.loads((base/'historical/offline-replay.json').read_text())
path=base/'historical/supplemental-code.json'
out=json.loads(path.read_text())
for item in state['missing']:
    if item.get('kind')!='code': continue
    url=f"https://sourcify.dev/server/v2/contract/1/{item['address']}?fields=all"
    row={'url':url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        raw=urllib.request.urlopen(url,timeout=20).read();data=json.loads(raw)
        row.update(sha256=hashlib.sha256(raw).hexdigest(),match=data.get('match'),deployment=data.get('deployment'),compiler=data.get('compilation',{}).get('compilerVersion'))
        # `match` can differ only in metadata. This is third-party onchain code,
        # NOT a fully independently authenticated historical code proof.
        row['runtimeMatch']=data.get('runtimeMatch')
        if data.get('match') in ['exact_match','match'] and int(data['deployment']['blockNumber'])<24626860:
            out['accounts'][item['address']]={'code':data['runtimeBytecode']['onchainBytecode'],'balance':'0x0','nonce':1,'storage':{}}
    except Exception as e: row['error']=str(e)
    out['calls'].append(row)
path.write_text(json.dumps(out,indent=2)+'\n')
