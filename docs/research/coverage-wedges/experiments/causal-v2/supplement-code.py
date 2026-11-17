"""Fetch missing immutable library bytecode only; never fill missing storage with zero."""
import datetime
import json
from pathlib import Path
import urllib.request
base=Path(__file__).parent
missing=json.loads((base/'historical/offline-replay.json').read_text())['missing']
out={'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'endpoint':'https://eth.drpc.org','calls':[],'accounts':{}}
path=base/'historical/supplemental-code.json'
if path.exists(): out['accounts']=json.loads(path.read_text())['accounts']
for item in missing:
    if item.get('kind')!='code': continue
    req={'jsonrpc':'2.0','id':1,'method':'eth_getCode','params':[item['address'],hex(24626859)]}
    try:
        raw=urllib.request.urlopen(urllib.request.Request(out['endpoint'],data=json.dumps(req).encode(),headers={'Content-Type':'application/json'}),timeout=15).read()
        data=json.loads(raw);out['calls'].append({'request':req,'response':data})
        if data.get('result','0x')!='0x':out['accounts'][item['address']]={'code':data['result'],'balance':'0x0','nonce':1,'storage':{}}
    except Exception as e:out['calls'].append({'request':req,'error':str(e)})
path.write_text(json.dumps(out,indent=2)+'\n')
