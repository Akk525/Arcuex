import {
  queueSections,
  type CaseTriage,
  type QueueSection,
  type ReviewReadiness,
  type VerificationState,
} from './investigation-presentation';
import { hasArcReceiptHash } from './settlement-presentation';

/** Client-side claims API response discrimination (auth vs empty vs malformed). */

export const CLAIMS_SIGN_IN_REQUIRED =
  'Sign in required to view claims. Use the wallet or ops session panel above.';

export type ClaimsClientFailureKind =
  'unauthorized' | 'forbidden' | 'malformed' | 'http' | 'network';

export type ClaimsClientResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: ClaimsClientFailureKind; status?: number; message: string };

export type LegacyClaimsLedger = {
  notice: string;
  mutationsEnabled?: boolean;
  incidents: Array<{ id: string; status: string; observedEventRef: string }>;
  claims: Array<{
    id: string;
    status: string;
    requestedUsdc: string;
    authorizedUsdc: string | null;
  }>;
  settlements: Array<{ id: string; status: string; amountUsdc: string }>;
};

export type ClaimsCaseListRow = {
  id: string;
  status: string;
  policyId: string;
  confirmedSettlementReceipt?: string;
  syntheticDemo: boolean;
  payable: { usdc: string | null };
  reviewReasonCode: string | null;
  updatedAt: string;
  createdAt?: string;
  triage?: CaseTriage;
  labels: { synthetic: string | null };
  /** Read-only display context; absent from older servers. */
  context?: ClaimListContext;
  verification?: ClaimVerificationFreshness;
};

export type ClaimListContext = {
  product: string | null;
  insured: { label: string | null; position: string | null };
  incident: { ref: string; observedAt: string } | null;
  openRequests: number;
  respondedRequests: number;
};

export type ClaimVerificationFreshness = {
  state: 'current' | 'stale' | 'failed' | 'none';
  at: string | null;
  validUntilMs: number | null;
  records: number;
};

const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function parseListContext(raw: unknown): ClaimListContext | undefined {
  if (!isRecord(raw) || !isRecord(raw.insured)) return undefined;
  if (!strOrNull(raw.product) || !strOrNull(raw.insured.label) || !strOrNull(raw.insured.position))
    return undefined;
  if (!count(raw.openRequests) || !count(raw.respondedRequests)) return undefined;
  const incident = raw.incident;
  if (
    incident !== null &&
    !(
      isRecord(incident) &&
      typeof incident.ref === 'string' &&
      typeof incident.observedAt === 'string'
    )
  )
    return undefined;
  return {
    product: raw.product,
    insured: { label: raw.insured.label, position: raw.insured.position },
    incident: incident
      ? { ref: incident.ref as string, observedAt: incident.observedAt as string }
      : null,
    openRequests: raw.openRequests,
    respondedRequests: raw.respondedRequests,
  };
}

function parseFreshness(raw: unknown): ClaimVerificationFreshness | undefined {
  if (!isRecord(raw)) return undefined;
  if (!['current', 'stale', 'failed', 'none'].includes(raw.state as string)) return undefined;
  if (!strOrNull(raw.at) || !count(raw.records)) return undefined;
  if (!(raw.validUntilMs === null || typeof raw.validUntilMs === 'number')) return undefined;
  return {
    state: raw.state as ClaimVerificationFreshness['state'],
    at: raw.at,
    validUntilMs: raw.validUntilMs,
    records: raw.records,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArrayItem(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return keys.every((k) => typeof value[k] === 'string');
}

export function parseClaimsCaseListPayload(json: unknown): ClaimsCaseListRow[] | null {
  if (!isRecord(json) || !Array.isArray(json.cases)) return null;
  const rows: ClaimsCaseListRow[] = [];
  for (const raw of json.cases) {
    if (!isRecord(raw)) return null;
    if (typeof raw.id !== 'string' || typeof raw.status !== 'string') return null;
    if (typeof raw.policyId !== 'string' || typeof raw.updatedAt !== 'string') return null;
    if (typeof raw.syntheticDemo !== 'boolean') return null;
    if (!isRecord(raw.payable)) return null;
    const usdc = raw.payable.usdc;
    if (!(usdc === null || typeof usdc === 'string')) return null;
    const reviewReasonCode = raw.reviewReasonCode;
    if (!(reviewReasonCode === null || typeof reviewReasonCode === 'string')) return null;
    if (!isRecord(raw.labels)) return null;
    const synthetic = raw.labels.synthetic;
    if (!(synthetic === null || typeof synthetic === 'string')) return null;
    rows.push({
      ...(hasArcReceiptHash(raw.confirmedSettlementReceipt) && !raw.syntheticDemo
        ? { confirmedSettlementReceipt: raw.confirmedSettlementReceipt }
        : {}),
      ...(isRecord(raw.triage) &&
      typeof raw.triage.section === 'string' &&
      Object.hasOwn(queueSections, raw.triage.section) &&
      typeof raw.triage.reason === 'string'
        ? { triage: { section: raw.triage.section as QueueSection, reason: raw.triage.reason } }
        : {}),
      ...(typeof raw.createdAt === 'string' ? { createdAt: raw.createdAt } : {}),
      ...(parseListContext(raw.context) ? { context: parseListContext(raw.context) } : {}),
      ...(parseFreshness(raw.verification)
        ? { verification: parseFreshness(raw.verification) }
        : {}),
      id: raw.id,
      status: raw.status,
      policyId: raw.policyId,
      syntheticDemo: raw.syntheticDemo,
      payable: { usdc },
      reviewReasonCode,
      updatedAt: raw.updatedAt,
      labels: { synthetic },
    });
  }
  return rows;
}

export function parseLegacyClaimsLedgerPayload(json: unknown): LegacyClaimsLedger | null {
  if (!isRecord(json)) return null;
  if (typeof json.notice !== 'string') return null;
  if (
    !Array.isArray(json.incidents) ||
    !Array.isArray(json.claims) ||
    !Array.isArray(json.settlements)
  ) {
    return null;
  }
  for (const row of json.incidents) {
    if (!isStringArrayItem(row, ['id', 'status', 'observedEventRef'])) return null;
  }
  for (const row of json.claims) {
    if (!isRecord(row)) return null;
    if (typeof row.id !== 'string' || typeof row.status !== 'string') return null;
    if (typeof row.requestedUsdc !== 'string') return null;
    if (!(row.authorizedUsdc === null || typeof row.authorizedUsdc === 'string')) return null;
  }
  for (const row of json.settlements) {
    if (!isStringArrayItem(row, ['id', 'status', 'amountUsdc'])) return null;
  }
  return {
    notice: json.notice,
    mutationsEnabled:
      typeof json.mutationsEnabled === 'boolean' ? json.mutationsEnabled : undefined,
    incidents: json.incidents as LegacyClaimsLedger['incidents'],
    claims: json.claims as LegacyClaimsLedger['claims'],
    settlements: json.settlements as LegacyClaimsLedger['settlements'],
  };
}

export function parseHistoricSettlementPayload(json: unknown): Record<string, unknown> | null {
  if (!isRecord(json)) return null;
  const required = [
    'notice',
    'explorerUrl',
    'txHash',
    'blockNumber',
    'amountUsdc',
    'beneficiary',
    'claimsAuthority',
    'pool',
    'lossKey',
    'verifiedAt',
  ] as const;
  for (const key of required) {
    if (typeof json[key] !== 'string') return null;
  }
  return json;
}

export function parsePolicyOptionsPayload(json: unknown): unknown[] | null {
  if (!isRecord(json) || !Array.isArray(json.policies)) return null;
  for (const raw of json.policies) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.status !== 'string') return null;
    if (!Array.isArray(raw.exposures)) return null;
  }
  return json.policies;
}

export function parseClaimCaseDetailPayload(json: unknown): {
  source?: Record<string, unknown>;
  principalRole?: string;
  fixtureCatalog?: Record<string, unknown>;
  linkedIncident?: Record<string, unknown>;
  verifications: unknown[];
  reviewReadiness?: ReviewReadiness;
  verificationStates: Record<string, VerificationState>;
  settlementVerificationBlocker?: string | null;
  case: Record<string, unknown>;
  timeline: unknown[];
  confirmedSettlementReceipt?: string;
  evidenceManifests: unknown[];
  context?: ClaimListContext;
} | null {
  if (!isRecord(json) || !isRecord(json.case)) return null;
  if (!Array.isArray(json.timeline) || !Array.isArray(json.evidenceManifests)) return null;
  if (typeof json.case.id !== 'string' || typeof json.case.status !== 'string') return null;
  return {
    source: isRecord(json.source) ? json.source : undefined,
    principalRole: typeof json.principalRole === 'string' ? json.principalRole : undefined,
    fixtureCatalog: isRecord(json.fixtureCatalog) ? json.fixtureCatalog : undefined,
    linkedIncident: isRecord(json.linkedIncident) ? json.linkedIncident : undefined,
    verifications: Array.isArray(json.verifications) ? json.verifications : [],
    verificationStates: Object.fromEntries(
      Object.entries(isRecord(json.verificationStates) ? json.verificationStates : {}).filter(
        (entry): entry is [string, VerificationState] =>
          entry[1] === 'current' || entry[1] === 'stale' || entry[1] === 'failed',
      ),
    ),
    ...(isRecord(json.reviewReadiness) &&
    (json.reviewReadiness.verificationId === null ||
      typeof json.reviewReadiness.verificationId === 'string') &&
    (json.reviewReadiness.blocker === null || typeof json.reviewReadiness.blocker === 'string')
      ? {
          reviewReadiness: {
            verificationId: json.reviewReadiness.verificationId,
            blocker: json.reviewReadiness.blocker,
          },
        }
      : {}),
    ...(typeof json.settlementVerificationBlocker === 'string' ||
    json.settlementVerificationBlocker === null
      ? { settlementVerificationBlocker: json.settlementVerificationBlocker }
      : {}),
    case: json.case,
    ...(parseListContext(json.context) ? { context: parseListContext(json.context) } : {}),
    ...(hasArcReceiptHash(json.confirmedSettlementReceipt)
      ? { confirmedSettlementReceipt: json.confirmedSettlementReceipt }
      : {}),
    timeline: json.timeline,
    evidenceManifests: json.evidenceManifests,
  };
}

export async function readClaimsClientResponse<T>(
  res: Response,
  parseSuccess: (json: unknown) => T | null,
): Promise<ClaimsClientResult<T>> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      ok: false,
      kind: 'malformed',
      status: res.status,
      message: 'Malformed claims API response',
    };
  }

  if (res.status === 401) {
    return {
      ok: false,
      kind: 'unauthorized',
      status: 401,
      message: CLAIMS_SIGN_IN_REQUIRED,
    };
  }
  if (res.status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      status: 403,
      message: CLAIMS_SIGN_IN_REQUIRED,
    };
  }
  if (!res.ok) {
    const message =
      isRecord(json) && typeof json.error === 'string' ? json.error : 'Claims request failed';
    return { ok: false, kind: 'http', status: res.status, message };
  }

  const data = parseSuccess(json);
  if (data === null) {
    return {
      ok: false,
      kind: 'malformed',
      status: res.status,
      message: 'Malformed claims API response',
    };
  }
  return { ok: true, data };
}

export function claimsNetworkFailure(
  error: unknown,
): Extract<ClaimsClientResult<unknown>, { ok: false }> {
  return {
    ok: false,
    kind: 'network',
    message: error instanceof Error ? error.message : 'Network error loading claims',
  };
}

export function isClaimsAuthFailure(result: ClaimsClientResult<unknown>): result is Extract<
  ClaimsClientResult<unknown>,
  { ok: false }
> & {
  kind: 'unauthorized' | 'forbidden';
} {
  return !result.ok && (result.kind === 'unauthorized' || result.kind === 'forbidden');
}
