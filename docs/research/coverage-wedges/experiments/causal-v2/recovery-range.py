import concurrent.futures
import datetime
import json
from pathlib import Path
import urllib.request
base=Path(__file__).parent
s=json.loads((base/'historical/selected-liquidation.json').read_text())
owner=s['selectedDecoded']['args']['user']; tx=s['selected']['transactionHash']
urls=[f'https://eth.blockscout.com/api?module=account&action=tokentx&address={owner}&contractaddress=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2&startblock=24626860&endblock=24800000&sort=asc',f'https://eth.blockscout.com/api/v2/transactions/{tx}',f'https://eth.blockscout.com/api/v2/transactions/{tx}/logs']
def fetch(url):
    out={'url':url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        with urllib.request.urlopen(url,timeout=20) as r:out.update(httpStatus=r.status,response=json.load(r))
    except Exception as e:out['error']=str(e)
    print(url,out.get('httpStatus',out.get('error')),flush=True)
    return out
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:out=list(pool.map(fetch,urls))
    (base/'historical/recovery-range.json').write_text(json.dumps(out,indent=2)+'\n')
