#!/usr/bin/env node
/**
 * Live Arc / QuickNode connectivity check (no secrets required for public hosts).
 */
const endpoints = [
  process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.io',
  process.env.QUICKNODE_RPC_URL ||
    process.env.NEXT_PUBLIC_QUICKNODE_RPC_URL ||
    'https://rpc.quicknode.testnet.arc.io',
];

async function call(url, method) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
  });
  if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${url} ${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

for (const url of endpoints) {
  const chainId = await call(url, 'eth_chainId');
  const block = await call(url, 'eth_blockNumber');
  const decimal = Number.parseInt(chainId, 16);
  console.log(JSON.stringify({ url, chainId, chainIdDecimal: decimal, blockNumber: block }, null, 0));
  if (decimal !== 5042002) {
    console.error(`Unexpected chain id from ${url}`);
    process.exitCode = 1;
  }
}
