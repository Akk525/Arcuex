import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { OnchainError } from './errors';

export type DeploymentManifest = {
  network: string;
  chainId: number;
  usdc: `0x${string}`;
  insurancePool: `0x${string}`;
  claimsAuthoritySet: boolean;
  feeRecipientSet: boolean;
  rpc: string;
  verifiedAt: string;
  notes?: string;
};

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function defaultManifestPath(repoRoot?: string): string {
  const root = repoRoot ?? process.cwd();
  return resolve(root, 'docs/deployments/arc-testnet-insurance-pool.json');
}

export function parseDeploymentManifest(raw: unknown): DeploymentManifest {
  if (!raw || typeof raw !== 'object') {
    throw new OnchainError('VALIDATION', 'Deployment manifest must be an object');
  }
  const m = raw as Record<string, unknown>;
  const chainId = Number(m.chainId);
  if (chainId !== ARC_TESTNET_CHAIN_ID) {
    throw new OnchainError(
      'VALIDATION',
      `Manifest chainId ${chainId} ≠ Arc Testnet ${ARC_TESTNET_CHAIN_ID}`,
    );
  }
  if (m.network !== 'arc-testnet') {
    throw new OnchainError('VALIDATION', `Manifest network must be arc-testnet (got ${String(m.network)})`);
  }
  const usdc = String(m.usdc);
  const insurancePool = String(m.insurancePool);
  const rpc = String(m.rpc ?? '');
  if (!ADDRESS_RE.test(usdc)) {
    throw new OnchainError('VALIDATION', 'Manifest usdc is not a valid address');
  }
  if (!ADDRESS_RE.test(insurancePool)) {
    throw new OnchainError('VALIDATION', 'Manifest insurancePool is not a valid address');
  }
  if (usdc.toLowerCase() !== ARC_USDC_ERC20_ADDRESS.toLowerCase()) {
    throw new OnchainError(
      'VALIDATION',
      `Manifest USDC ${usdc} ≠ official Arc USDC ${ARC_USDC_ERC20_ADDRESS}`,
    );
  }
  if (!rpc.startsWith('http')) {
    throw new OnchainError('VALIDATION', 'Manifest rpc must be an http(s) URL');
  }
  return {
    network: 'arc-testnet',
    chainId: ARC_TESTNET_CHAIN_ID,
    usdc: usdc as `0x${string}`,
    insurancePool: insurancePool as `0x${string}`,
    claimsAuthoritySet: Boolean(m.claimsAuthoritySet),
    feeRecipientSet: Boolean(m.feeRecipientSet),
    rpc,
    verifiedAt: String(m.verifiedAt ?? ''),
    notes: m.notes ? String(m.notes) : undefined,
  };
}

export function loadDeploymentManifest(path?: string): DeploymentManifest {
  const file = path ?? defaultManifestPath();
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (cause) {
    throw new OnchainError('NOT_DEPLOYED', `Cannot read deployment manifest at ${file}`, {
      cause,
    });
  }
  return parseDeploymentManifest(JSON.parse(text) as unknown);
}
