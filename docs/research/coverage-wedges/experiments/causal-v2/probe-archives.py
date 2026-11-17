"""Bounded public archive alternatives; fixed discovered range, no API keys."""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import urllib.request

adapter = '0xe1D97bF61901B075E9626c8A2340a7De385861Ef'
jobs = []
for endpoint in ['https://eth.drpc.org', 'https://1rpc.io/eth', 'https://cloudflare-eth.com', 'https://ethereum-rpc.publicnode.com']:
    for method, params in [('eth_getLogs', [{'address': adapter, 'fromBlock': hex(24623353), 'toBlock': hex(24630504)}]), ('eth_getCode', [adapter, hex(24623353)])]:
        jobs.append((endpoint, {'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}))
jobs.append((f'https://sourcify.dev/server/v2/contract/1/{adapter}?fields=all', None))

def fetch(job):
    url, payload = job
    row = {'url': url, 'request': payload, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        req = urllib.request.Request(url, data=None if payload is None else json.dumps(payload).encode(), headers={'Content-Type': 'application/json', 'User-Agent': 'Arcuex-public-research/1.0'})
        with urllib.request.urlopen(req, timeout=15) as res:
            raw = res.read()
            data = json.loads(raw)
            row.update(httpStatus=res.status, sha256=hashlib.sha256(raw).hexdigest())
            if payload and payload['method'] == 'eth_getCode' and 'result' in data:
                row['resultBytes'] = (len(data['result']) - 2) // 2
                row['codeSha256'] = hashlib.sha256(bytes.fromhex(data['result'][2:])).hexdigest()
                Path('/private/tmp/arcuex-public-source-cache/adapter-code.hex').write_text(data['result'])
            elif payload is None:
                Path('/private/tmp/arcuex-public-source-cache/sourcify.json').write_bytes(raw)
                row['summary'] = {k: data.get(k) for k in ['match', 'creationMatch', 'runtimeMatch', 'verifiedAt', 'deployment']}
            else: row['response'] = data
    except Exception as error: row['error'] = str(error)
    print(url, None if payload is None else payload['method'], row.get('error', row.get('httpStatus')), flush=True)
    return row

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: rows = list(pool.map(fetch, jobs))
    (Path(__file__).parent / 'historical/archive-probes.json').write_text(json.dumps(rows, indent=2) + '\n')
