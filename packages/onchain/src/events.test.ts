import { describe, expect, it } from 'vitest';
import {
  encodeEventTopics,
  encodeAbiParameters,
  keccak256,
  type Hex,
} from 'viem';
import { insurancePoolAbi } from './abi/insurance-pool';
import {
  claimSettledEventTopic,
  decodePoolLog,
  decodePoolLogs,
  poolEventDedupeKey,
  policyBoundEventTopic,
} from './events';
import { computeLossKey } from './ids';

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

describe('InsurancePool event ABI decode', () => {
  it('ClaimSettled topic matches ABI and includes lossKey', () => {
    const topics = encodeEventTopics({
      abi: insurancePoolAbi,
      eventName: 'ClaimSettled',
      args: { policyId: POLICY, claimId: CLAIM, lossKey: LOSS },
    });
    expect(topics[0]?.toLowerCase()).toBe(claimSettledEventTopic().toLowerCase());

    const data = encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
      ],
      [BENE, 1_500_000n, 1_500_000n, 1_500_000n],
    );

    const decoded = decodePoolLog({
      topics: topics as [Hex, ...Hex[]],
      data,
    });
    expect(decoded.eventName).toBe('ClaimSettled');
    if (decoded.eventName === 'ClaimSettled') {
      expect(decoded.args.policyId.toLowerCase()).toBe(POLICY.toLowerCase());
      expect(decoded.args.claimId.toLowerCase()).toBe(CLAIM.toLowerCase());
      expect(decoded.args.lossKey.toLowerCase()).toBe(LOSS.toLowerCase());
      expect(decoded.args.amount).toBe(1_500_000n);
      expect(decoded.args.lossPaidTotal).toBe(1_500_000n);
      expect(decoded.args.lossCap).toBe(1_500_000n);
      expect(decoded.args.beneficiary.toLowerCase()).toBe(BENE.toLowerCase());
    }
  });

  it('PolicyBound topic is stable against ABI', () => {
    expect(policyBoundEventTopic()).toMatch(/^0x[a-f0-9]{64}$/i);
    const topics = encodeEventTopics({
      abi: insurancePoolAbi,
      eventName: 'PolicyBound',
      args: {
        policyId: POLICY,
        beneficiary: BENE,
        premiumPayer: BENE,
      },
    });
    expect(topics[0]?.toLowerCase()).toBe(policyBoundEventTopic().toLowerCase());
  });

  it('dedupe keys are durable across identical deliveries', () => {
    const log = {
      transactionHash: ('0x' + 'ab'.repeat(32)) as Hex,
      logIndex: 3,
      topics: [claimSettledEventTopic()] as Hex[],
      data: '0x' as Hex,
    };
    const a = poolEventDedupeKey(log);
    const b = poolEventDedupeKey(log);
    expect(a).toBe(b);
    expect(a).toContain(':3:');
  });

  it('decodePoolLogs skips unknown topics and keeps pool events', () => {
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
    const junkTopic = keccak256('0xdead' as Hex);
    const rows = decodePoolLogs([
      {
        transactionHash: ('0x' + '01'.repeat(32)) as Hex,
        logIndex: 0,
        topics: [junkTopic] as [Hex, ...Hex[]],
        data: '0x',
      },
      {
        transactionHash: ('0x' + '02'.repeat(32)) as Hex,
        logIndex: 1,
        topics: topics as [Hex, ...Hex[]],
        data,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event.eventName).toBe('ClaimSettled');
    expect(rows[0]?.dedupeKey).toContain(':1:');
  });
});
