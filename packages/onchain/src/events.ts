import {
  type Address,
  type Hex,
  type Log,
  decodeEventLog,
  getEventSelector,
} from 'viem';
import { insurancePoolAbi } from './abi/insurance-pool';

export type ClaimSettledArgs = {
  policyId: Hex;
  claimId: Hex;
  lossKey: Hex;
  beneficiary: Address;
  amount: bigint;
  lossPaidTotal: bigint;
  lossCap: bigint;
};

export type PolicyBoundArgs = {
  policyId: Hex;
  termsHash: Hex;
  beneficiary: Address;
  premiumPayer: Address;
  premium: bigint;
  limit: bigint;
  coverageStart: bigint;
  coverageEnd: bigint;
};

export type DecodedPoolEvent =
  | { eventName: 'ClaimSettled'; args: ClaimSettledArgs }
  | { eventName: 'PolicyBound'; args: PolicyBoundArgs }
  | { eventName: 'Deposited'; args: { lp: Address; assets: bigint; shares: bigint } }
  | { eventName: 'Withdrawn'; args: { lp: Address; assets: bigint; shares: bigint } }
  | { eventName: 'ReservationReleased'; args: { policyId: Hex; amount: bigint } }
  | { eventName: 'ClaimsAuthorityUpdated'; args: { previous: Address; next: Address } }
  | { eventName: 'FeeRecipientUpdated'; args: { previous: Address; next: Address } };

/** Durable dedupe key for a log (tx + logIndex + topic0). Independent of delivery path. */
export function poolEventDedupeKey(log: {
  transactionHash?: Hex | null;
  logIndex?: number | null;
  topics: readonly Hex[] | Hex[];
}): string {
  const topic0 = log.topics[0] ?? 'no-topic';
  return [
    log.transactionHash ?? 'no-tx',
    log.logIndex === undefined || log.logIndex === null ? 'no-log' : String(log.logIndex),
    topic0,
  ].join(':');
}

export function claimSettledEventTopic(): Hex {
  return getEventSelector(
    'ClaimSettled(bytes32,bytes32,bytes32,address,uint256,uint256,uint256)',
  );
}

export function policyBoundEventTopic(): Hex {
  return getEventSelector(
    'PolicyBound(bytes32,bytes32,address,address,uint256,uint256,uint64,uint64)',
  );
}

/**
 * Decode an InsurancePool log against the checked-in ABI.
 * Throws if topics/data do not match — callers should catch for unknown logs.
 */
export function decodePoolLog(log: Pick<Log, 'data' | 'topics'>): DecodedPoolEvent {
  const decoded = decodeEventLog({
    abi: insurancePoolAbi,
    data: log.data,
    topics: log.topics,
  });

  if (decoded.eventName === 'ClaimSettled') {
    const a = decoded.args;
    return {
      eventName: 'ClaimSettled',
      args: {
        policyId: a.policyId,
        claimId: a.claimId,
        lossKey: a.lossKey,
        beneficiary: a.beneficiary,
        amount: a.amount,
        lossPaidTotal: a.lossPaidTotal,
        lossCap: a.lossCap,
      },
    };
  }
  if (decoded.eventName === 'PolicyBound') {
    const a = decoded.args;
    return {
      eventName: 'PolicyBound',
      args: {
        policyId: a.policyId,
        termsHash: a.termsHash,
        beneficiary: a.beneficiary,
        premiumPayer: a.premiumPayer,
        premium: a.premium,
        limit: a.limit,
        coverageStart: a.coverageStart,
        coverageEnd: a.coverageEnd,
      },
    };
  }
  if (decoded.eventName === 'Deposited') {
    const a = decoded.args;
    return {
      eventName: 'Deposited',
      args: { lp: a.lp, assets: a.assets, shares: a.shares },
    };
  }
  if (decoded.eventName === 'Withdrawn') {
    const a = decoded.args;
    return {
      eventName: 'Withdrawn',
      args: { lp: a.lp, assets: a.assets, shares: a.shares },
    };
  }
  if (decoded.eventName === 'ReservationReleased') {
    const a = decoded.args;
    return {
      eventName: 'ReservationReleased',
      args: { policyId: a.policyId, amount: a.amount },
    };
  }
  if (decoded.eventName === 'ClaimsAuthorityUpdated') {
    const a = decoded.args;
    return {
      eventName: 'ClaimsAuthorityUpdated',
      args: { previous: a.previous, next: a.next },
    };
  }
  if (decoded.eventName === 'FeeRecipientUpdated') {
    const a = decoded.args;
    return {
      eventName: 'FeeRecipientUpdated',
      args: { previous: a.previous, next: a.next },
    };
  }

  throw new Error(`Unhandled InsurancePool event: ${String(decoded.eventName)}`);
}

/**
 * Decode many logs; skip undecodable rows (other contracts / unknown topics).
 * Returns paired dedupe keys for durable inbox insertion.
 */
export function decodePoolLogs(
  logs: Array<Pick<Log, 'data' | 'topics' | 'transactionHash' | 'logIndex'>>,
): Array<{ dedupeKey: string; event: DecodedPoolEvent }> {
  const out: Array<{ dedupeKey: string; event: DecodedPoolEvent }> = [];
  for (const log of logs) {
    try {
      const event = decodePoolLog(log);
      out.push({ dedupeKey: poolEventDedupeKey(log), event });
    } catch {
      // ignore non-pool / malformed
    }
  }
  return out;
}
