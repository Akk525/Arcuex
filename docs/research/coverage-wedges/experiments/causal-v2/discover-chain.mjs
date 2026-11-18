// Credential-free historical discovery, not a claim verifier. Run from repo root.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const require = createRequire(resolve('packages/chain/package.json'));
const { encodeFunctionData, parseAbi, keccak256, toHex, pad } = require('viem');
const endpoint = 'https://ethereum-rpc.publicnode.com';
const calls = [];
const output = { retrievedAt: new Date().toISOString(), endpoint, calls };
const pools = ['0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', '0x4e033931ad43597d96D6bcc25c280717730B58B1'];
const wrapper = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
async function rpc(method, params) {
  const request = { jsonrpc: '2.0', id: calls.length + 1, method, params };
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    calls.push({ request, httpStatus: response.status, response: data });
    if (data.error) throw Error(JSON.stringify(data.error));
    if (data.id !== request.id || data.result === undefined) throw Error('Invalid JSON-RPC response');
    return data.result;
  } catch (error) {
    calls.push({ request, transportError: String(error) });
    throw error;
  }
}
async function block(n) { return rpc('eth_getBlockByNumber', [toHex(n), false]); }
async function lowerBound(timestamp, latest) {
  // Provider explicitly reported earliest retained block 15500000 on first probe.
  // Discovery bound only; not a claim about the incident height.
  let lo = 15500000, hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const b = await block(mid);
    if (Number(BigInt(b.timestamp)) < timestamp) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
async function call(to, signature, args, blockNumber) {
  const abi = parseAbi([`function ${signature}`]);
  const name = signature.split('(')[0];
  return rpc('eth_call', [{ to, data: encodeFunctionData({ abi, functionName: name, args }) }, toHex(blockNumber)]);
}
try {
  if (await rpc('eth_chainId', []) !== '0x1') throw Error('Wrong chain');
  const latest = Number(BigInt(await rpc('eth_blockNumber', [])));
  const start = await lowerBound(Date.parse('2026-03-10T00:00:00Z') / 1000, latest);
  const end = await lowerBound(Date.parse('2026-03-11T00:00:00Z') / 1000, latest);
  output.dayRange = { start, endExclusive: end };
  console.log('day range', output.dayRange);
  const topic = keccak256(toHex('LiquidationCall(address,address,address,uint256,uint256,address,bool)'));
  const logs = [];
  for (let from = start; from < end; from += 1000) {
    const batch = await rpc('eth_getLogs', [{ address: pools, fromBlock: toHex(from), toBlock: toHex(Math.min(end - 1, from + 999)), topics: [topic, pad(wrapper.toLowerCase(), { size: 32 })] }]);
    logs.push(...batch);
  }
  output.liquidations = logs;
  console.log('liquidations', logs.length);
  if (logs.length) {
    logs.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.transactionIndex) - BigInt(b.transactionIndex)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
    const first = logs[0];
    const n = Number(BigInt(first.blockNumber));
    output.selected = first;
    output.receipt = await rpc('eth_getTransactionReceipt', [first.transactionHash]);
    output.transaction = await rpc('eth_getTransactionByHash', [first.transactionHash]);
    output.block = await block(n);
    const oracle = '0x54586bE62E3c3580375aE3723C145253060Ca0C2';
    output.sourceCall = await call(oracle, 'getSourceOfAsset(address) view returns (address)', [wrapper], n);
    const adapter = '0x' + output.sourceCall.slice(-40);
    output.adapter = adapter;
    output.observations = {};
    for (const signature of ['latestAnswer() view returns (int256)', 'getRatio() view returns (int256)', 'getSnapshotRatio() view returns (uint256)', 'getSnapshotTimestamp() view returns (uint256)', 'getMaxRatioGrowthPerSecondScaled() view returns (uint256)', 'RATIO_PROVIDER() view returns (address)', 'BASE_TO_USD_AGGREGATOR() view returns (address)']) {
      try { output.observations[signature] = await call(adapter, signature, [], n); }
      catch (error) { output.observations[signature] = { error: String(error) }; }
    }
  }
} catch (error) { output.blocker = String(error); console.log('BLOCKED', String(error)); }
finally {
  writeFileSync(new URL('./historical/rpc-discovery.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
}
