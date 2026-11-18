"""Public, credential-free discovery. Never infers missing historical values.
Run from this directory. HTTP artifacts go to historical/discovery.json.
Source code bodies are cached outside the repository for inspection only.
"""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import urllib.request

OUT = Path(__file__).parent / 'historical/discovery.json'
TASKS = {
    'capo-tree': ('https://api.github.com/repos/aave-dao/aave-price-feeds/git/trees/main?recursive=1', None),
    'proposals-tree': ('https://api.github.com/repos/aave-dao/aave-proposals-v3/git/trees/main?recursive=1', None),
    'addressbook-tree': ('https://api.github.com/repos/bgd-labs/aave-address-book/git/trees/main?recursive=1', None),
    'publicnode': ('https://ethereum-rpc.publicnode.com', [{'jsonrpc': '2.0', 'id': 1, 'method': 'eth_chainId', 'params': []}, {'jsonrpc': '2.0', 'id': 2, 'method': 'eth_blockNumber', 'params': []}]),
    'llamarpc': ('https://eth.llamarpc.com', [{'jsonrpc': '2.0', 'id': 1, 'method': 'eth_chainId', 'params': []}, {'jsonrpc': '2.0', 'id': 2, 'method': 'eth_blockNumber', 'params': []}]),
    'report-json': ('https://governance.aave.com/t/24269.json', None),
    'recovery-json': ('https://governance.aave.com/t/24275.json', None),
}

def collect(item):
    key, (url, payload) = item
    row = {'id': key, 'url': url, 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        req = urllib.request.Request(url, data=None if payload is None else json.dumps(payload).encode(), headers={'User-Agent': 'Arcuex-public-research/1.0', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            row.update(httpStatus=response.status, sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
            data = json.loads(raw)
            if key.endswith('tree'):
                row['treeSha'] = data.get('sha')
                row['truncated'] = data.get('truncated')
                row['candidates'] = [x for x in data.get('tree', []) if
                    ('202603' in x['path'] and any(w in x['path'].lower() for w in ['capo', 'wsteth', 'reimburs', 'riskagent'])) or
                    (key == 'capo-tree' and any(w in x['path'] for w in ['WstETH', 'PriceCapAdapterBase', 'CLRatePriceCapAdapter', 'README'])) or
                    (key == 'addressbook-tree' and x['path'] in ['src/AaveV3Ethereum.sol', 'src/AaveV3EthereumLido.sol'])]
            elif key.endswith('json'):
                import re
                row['posts'] = [{'number': p['post_number'], 'author': p['username'], 'createdAt': p['created_at'],
                    'links': re.findall(r'href="([^"]+)"', p['cooked']),
                    'addressesAndHashes': sorted(set(re.findall(r'0x[0-9a-fA-F]{40,64}', p['cooked'])))} for p in data.get('post_stream', {}).get('posts', [])]
            else:
                row['request'] = payload
                row['response'] = data
    except Exception as exc:
        row['error'] = str(exc)
    print(key, row.get('httpStatus', row.get('error')), flush=True)
    return row

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        rows = list(pool.map(collect, TASKS.items()))
    OUT.write_text(json.dumps(rows, indent=2) + '\n')
