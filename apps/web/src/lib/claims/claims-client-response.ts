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
  syntheticDemo: boolean;
  payable: { usdc: string | null };
  reviewReasonCode: string | null;
  updatedAt: string;
  labels: { synthetic: string | null };
};

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
  principalRole?: string;
  fixtureCatalog?: Record<string, unknown>;
  linkedIncident?: Record<string, unknown>;
  verifications: unknown[];
  case: Record<string, unknown>;
  timeline: unknown[];
  evidenceManifests: unknown[];
} | null {
  if (!isRecord(json) || !isRecord(json.case)) return null;
  if (!Array.isArray(json.timeline) || !Array.isArray(json.evidenceManifests)) return null;
  if (typeof json.case.id !== 'string' || typeof json.case.status !== 'string') return null;
  return {
    principalRole: typeof json.principalRole === 'string' ? json.principalRole : undefined,
    fixtureCatalog: isRecord(json.fixtureCatalog) ? json.fixtureCatalog : undefined,
    linkedIncident: isRecord(json.linkedIncident) ? json.linkedIncident : undefined,
    verifications: Array.isArray(json.verifications) ? json.verifications : [],
    case: json.case,
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
