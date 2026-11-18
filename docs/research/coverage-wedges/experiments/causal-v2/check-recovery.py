"""Public indexer discovery and second-provider receipt corroboration; no assumed refunds."""
import concurrent.futures
import datetime
import json
from pathlib import Path
import urllib.request
base=Path(__file__).parent
s=json.loads((base/'historical/selected-liquidation.json').read_text())
owner=s['selectedDecoded']['args']['user']
jobs=[(f'https://eth.blockscout.com/api/v2/addresses/{owner}/token-transfers?type=ERC-20&token=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',None)]
for endpoint in ['https://1rpc.io/eth','https://ethereum-rpc.publicnode.com']:
    jobs.append((endpoint,{'jsonrpc':'2.0','id':1,'method':'eth_getTransactionReceipt','params':[s['selected']['transactionHash']]}))

def fetch(job):
    url,req=job;row={'url':url,'request':req,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        r=urllib.request.Request(url,data=None if req is None else json.dumps(req).encode(),headers={'Content-Type':'application/json','User-Agent':'Arcuex-public-research/1.0'})
        with urllib.request.urlopen(r,timeout=15) as res:row.update(httpStatus=res.status,response=json.load(res))
    except Exception as e:row['error']=str(e)
    print(url,row.get('httpStatus',row.get('error')),flush=True)
    return row
if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:rows=list(pool.map(fetch,jobs))
    (base/'historical/recovery-and-corroboration.json').write_text(json.dumps(rows,indent=2)+'\n')
