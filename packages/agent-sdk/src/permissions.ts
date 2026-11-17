import { type Address, type Hex } from 'viem';
import { insurancePoolAbi } from '@arcuex/onchain';
import { erc20Abi } from 'viem';

/**
 * Narrow allowlist for autonomous agent transaction preparation.
 * Agents may prepare these calls; humans/wallets still must sign.
 */
export type AllowedAgentAction =
  | { kind: 'usdc_approve'; token: Address; spender: Address; amount: bigint }
  | {
      kind: 'bind_policy';
      pool: Address;
      policyId: Hex;
      termsHash: Hex;
      beneficiary: Address;
      premium: bigint;
      limit: bigint;
      coverageStart: bigint;
      coverageEnd: bigint;
    }
  | { kind: 'deposit'; pool: Address; amount: bigint };

export const AGENT_PERMISSION_SCOPE = [
  'erc20.approve(usdc → insurancePool)',
  'InsurancePool.bindPolicy',
  'InsurancePool.deposit (LP agents only)',
] as const;

export function describeAllowedAbis(): {
  usdc: typeof erc20Abi;
  insurancePool: typeof insurancePoolAbi;
} {
  return { usdc: erc20Abi, insurancePool: insurancePoolAbi };
}

export function assertActionAllowed(action: AllowedAgentAction, pool: Address, usdc: Address): void {
  if (action.kind === 'usdc_approve') {
    if (action.token.toLowerCase() !== usdc.toLowerCase()) {
      throw new Error('Agent may only approve the configured USDC token');
    }
    if (action.spender.toLowerCase() !== pool.toLowerCase()) {
      throw new Error('Agent may only approve the InsurancePool as spender');
    }
    return;
  }
  if (action.kind === 'bind_policy' || action.kind === 'deposit') {
    if (action.pool.toLowerCase() !== pool.toLowerCase()) {
      throw new Error('Agent action targets unexpected pool');
    }
    return;
  }
  const _exhaustive: never = action;
  void _exhaustive;
}
