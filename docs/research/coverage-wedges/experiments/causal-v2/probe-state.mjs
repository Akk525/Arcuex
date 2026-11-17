import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
const { encodeFunctionData, parseAbi, keccak256, toHex } = createRequire(resolve('packages/chain/package.json'))('viem');
const endpoint = 'https://eth.drpc.org';
const rows = [];
async function request(method, params) {
  const req = { jsonrpc: '2.0', id: rows.length + 1, method, params };
  const row = { request: req };
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal: AbortSignal.timeout(15000) });
    row.httpStatus = res.status;
    row.response = await res.text();
  } catch (e) { row.error = String(e); }
  rows.push(row);
  console.log(method, row.httpStatus, String(row.response).slice(0,180));
}
const adapter = '0xe1D97bF61901B075E9626c8A2340a7De385861Ef';
try {
  for (const n of [24623353, 24630504]) for (const sig of [
    'getSnapshotRatio() view returns (uint256)', 'getSnapshotTimestamp() view returns (uint256)',
    'getMaxRatioGrowthPerSecond() view returns (uint256)', 'getRatio() view returns (int256)',
    'latestAnswer() view returns (int256)', 'RATIO_PROVIDER() view returns (address)',
  ]) await request('eth_call', [{ to: adapter, data: encodeFunctionData({ abi: parseAbi([`function ${sig}`]), functionName: sig.split('(')[0] }) }, toHex(n)]);
  await request('eth_getLogs', [{ address: adapter, fromBlock: toHex(24623353), toBlock: toHex(24623402) }]);
  await request('eth_getLogs', [{ address: adapter, fromBlock: toHex(24623353), toBlock: toHex(24630504), topics: [keccak256(toHex('CapParametersUpdated(uint104,uint48,uint104,uint16)'))] }]);
} finally {
  const sourcify = JSON.parse(readFileSync('/private/tmp/arcuex-public-source-cache/sourcify.json', 'utf8'));
  const code = readFileSync('/private/tmp/arcuex-public-source-cache/adapter-code.hex', 'utf8');
  writeFileSync(new URL('./historical/state-probes.json',import.meta.url), JSON.stringify({ endpoint, retrievedAt: new Date().toISOString(), calls: rows,
    codeKeccak: keccak256(code), sourcifyRuntimeKeccak: keccak256(sourcify.runtimeBytecode.onchainBytecode),
    exactRuntimeMatch: code.toLowerCase() === sourcify.runtimeBytecode.onchainBytecode.toLowerCase(),
    deployedSourceSha: sourcify.metadata?.sources,
  },null,2)+'\n');
}
