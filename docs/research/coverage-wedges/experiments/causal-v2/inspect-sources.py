"""Fetch pinned public source into /private/tmp; persist provenance, not source bodies."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

BASE = Path(__file__).parent
rows = json.loads((BASE / 'historical/discovery.json').read_text())
trees = {r['id']: r['treeSha'] for r in rows if 'treeSha' in r}
jobs = []
for name in ['PriceCapAdapterBase.sol', 'lst-adapters/WstETHPriceCapAdapter.sol']:
    jobs.append(('capo-' + name.replace('/', '-'), f"https://raw.githubusercontent.com/aave-dao/aave-price-feeds/{trees['capo-tree']}/src/contracts/{name}"))
for name in ['AaveV3Ethereum.sol', 'AaveV3EthereumLido.sol']:
    jobs.append((name, f"https://raw.githubusercontent.com/bgd-labs/aave-address-book/{trees['addressbook-tree']}/src/{name}"))
jobs.append(('reimbursement-diff.md', f"https://raw.githubusercontent.com/aave-dao/aave-proposals-v3/{trees['proposals-tree']}/diffs/AaveV3Ethereum_WstETHCAPOOracleIncidentUserReimbursement_20260312_before_AaveV3Ethereum_WstETHCAPOOracleIncidentUserReimbursement_20260312_after.md"))
jobs.append(('proposals-paths', f"https://api.github.com/repos/aave-dao/aave-proposals-v3/git/trees/{trees['proposals-tree']}?recursive=1"))

def fetch(job):
    name, url = job
    try:
        raw = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Arcuex-public-research/1.0'}), timeout=20).read()
        cache = Path('/private/tmp/arcuex-public-source-cache')
        cache.mkdir(exist_ok=True)
        (cache / name).write_bytes(raw)
        row = {'id': name, 'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
        if name == 'proposals-paths':
            row['paths'] = [x['path'] for x in json.loads(raw)['tree'] if '202603' in x['path'] or 'reimburs' in x['path'].lower()]
        print(name, len(raw), flush=True)
        return row
    except Exception as e:
        return {'id': name, 'url': url, 'error': str(e)}

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        data = list(pool.map(fetch, jobs))
    (BASE / 'historical/source-provenance.json').write_text(json.dumps(data, indent=2) + '\n')
