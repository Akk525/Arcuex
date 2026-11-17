import { describe, expect, it, vi } from 'vitest';
import {
  encodeAbiParameters,
  encodeEventTopics,
  type Hex,
  type PublicClient,
} from 'viem';
import { insurancePoolAbi } from './abi/insurance-pool';
import { computeLossKey } from './ids';
import { mergeSeenDedupeKeys, reconcileFromBackfillLogs } from './reconcile-events';

const POLICY = ('0x' + '11'.repeat(32)) as Hex;
const CLAIM = ('0x' + '22'.repeat(32)) as Hex;
const LOSS = computeLossKey({
  chainId: 31337,
  policyId: POLICY,
  exposureKey: ('0x' + '33'.repeat(32)) as Hex,
  incidentRef: ('0x' + '44'.repeat(32)) as Hex,
  lossLotId: ('0x' + '55'.repeat(32)) as Hex,
});
const BENE = '0x00000000000000000000000000000000000000aa' as Hex;
const POOL = '0x00000000000000000000000000000000000000dd' as Hex;

function settledLog(tx: Hex, logIndex: number) {
  const topics = encodeEventTopics({
    abi: insurancePoolAbi,
    eventName: 'ClaimSettled',
    args: { policyId: POLICY, claimId: CLAIM, lossKey: LOSS },
  });
  const data = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
    ],
    [BENE, 100n, 100n, 500n],
  );
  return {
    transactionHash: tx,
    logIndex,
    topics: topics as [Hex, ...Hex[]],
    data,
  };
}

describe('reconcileFromBackfillLogs', () => {
  it('dedupes against prior deliveries and checks chain state', async () => {
    const log = settledLog(('0x' + 'ab'.repeat(32)) as Hex, 7);
    const client = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        switch (functionName) {
          case 'totalAssets':
            return 10_000n;
          case 'totalReserved':
            return 900n;
          case 'totalShares':
            return 10_000n;
          case 'availableCapital':
            return 9_100n;
          case 'claimsAuthority':
            return '0x00000000000000000000000000000000000000bb';
          case 'usdc':
            return '0x3600000000000000000000000000000000000000';
          case 'balanceOf':
            return 10_000n;
          case 'settledClaims':
            return true;
          case 'losses':
            return [POLICY, 500n, 100n, true];
          case 'policies':
            return [
              ('0x' + '99'.repeat(32)) as Hex,
              BENE,
              BENE,
              1_000n,
              10n,
              1n,
              2n,
              900n,
              100n,
              true,
              false,
            ];
          default:
            throw new Error(functionName);
        }
      }),
    } as unknown as PublicClient;

    const first = await reconcileFromBackfillLogs(client, POOL, [log]);
    expect(first.novelDedupeKeys).toHaveLength(1);
    expect(first.skippedDuplicates).toHaveLength(0);
    expect(first.poolOk).toBe(true);

    const seen = mergeSeenDedupeKeys(new Set(), first.novelDedupeKeys);
    const second = await reconcileFromBackfillLogs(client, POOL, [log], seen);
    expect(second.skippedDuplicates).toEqual(first.novelDedupeKeys);
    expect(second.novelDedupeKeys).toHaveLength(0);
    expect(second.poolOk).toBe(true);
  });

  it('flags ClaimSettled when settledClaims is false (missed state)', async () => {
    const log = settledLog(('0x' + 'cd'.repeat(32)) as Hex, 1);
    const client = {
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        switch (functionName) {
          case 'totalAssets':
            return 10_000n;
          case 'totalReserved':
            return 0n;
          case 'totalShares':
            return 10_000n;
          case 'availableCapital':
            return 10_000n;
          case 'claimsAuthority':
            return '0x00000000000000000000000000000000000000bb';
          case 'usdc':
            return '0x3600000000000000000000000000000000000000';
          case 'balanceOf':
            return 10_000n;
          case 'settledClaims':
            return false;
          default:
            throw new Error(functionName);
        }
      }),
    } as unknown as PublicClient;

    const result = await reconcileFromBackfillLogs(client, POOL, [log]);
    expect(result.poolOk).toBe(false);
    expect(result.mismatches.some((m) => m.includes('settledClaims=false'))).toBe(true);
  });
});
