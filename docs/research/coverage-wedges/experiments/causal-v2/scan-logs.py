"""Adapt to Cloudflare's observed 800-block range limit, preserving exact errors."""
import concurrent.futures
import datetime
import json
from pathlib import Path
import urllib.request
import urllib.error

base = Path(__file__).parent
initial = json.loads((base / 'historical/rpc-discovery.json').read_text())
log_request = next(c['request']['params'][0] for c in initial['calls'] if c['request']['method'] == 'eth_getLogs')
jobs = []
for start in range(24623353, 24630505, 800):
    params = {**log_request, 'fromBlock': hex(start), 'toBlock': hex(min(start + 799, 24630504))}
    jobs.append({'jsonrpc': '2.0', 'id': start, 'method': 'eth_getLogs', 'params': [params]})

def fetch(req):
    row = {'request': req}
    try:
        request = urllib.request.Request('https://cloudflare-eth.com', data=json.dumps(req).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=15) as res:
            row.update(httpStatus=res.status, response=json.load(res))
    except urllib.error.HTTPError as e: row.update(error=str(e), errorBody=e.read().decode(errors='replace'))
    except Exception as e: row['error'] = str(e)
    print(req['id'],len(row.get('response',{}).get('result',[])),row.get('response',{}).get('error',row.get('error','')),flush=True)
    return row

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: rows=list(pool.map(fetch,jobs))
    out = {'endpoint': 'https://cloudflare-eth.com', 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'calls': rows}
    (base / 'historical/log-scan.json').write_text(json.dumps(out,indent=2)+'\n')
