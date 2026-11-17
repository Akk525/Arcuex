import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * QuickNode Streams webhook signature verification.
 * Signed payload = nonce + timestamp + body (no separators), HMAC-SHA256 hex.
 * Source: QuickNode Streams webhook validation docs / quiknode-labs examples (2026-11-16).
 *
 * RPC polling is NOT Streams. Do not claim Streams bounty from this module alone
 * without a live authenticated webhook delivery.
 */
export type StreamsHeaders = {
  nonce: string;
  timestamp: string;
  signature: string;
};

export function parseStreamsHeaders(headers: Headers | Record<string, string | null | undefined>): StreamsHeaders | null {
  const get = (k: string) => {
    if (headers instanceof Headers) return headers.get(k) ?? headers.get(k.toLowerCase());
    return headers[k] ?? headers[k.toLowerCase()] ?? null;
  };
  const nonce = get('x-qn-nonce') ?? get('X-QN-Nonce');
  const timestamp = get('x-qn-timestamp') ?? get('X-QN-Timestamp');
  const signature = get('x-qn-signature') ?? get('X-QN-Signature');
  if (!nonce || !timestamp || !signature) return null;
  return { nonce, timestamp, signature };
}

export function verifyStreamsSignature(input: {
  securityToken: string;
  nonce: string;
  timestamp: string;
  /** Uncompressed UTF-8 body string (after gzip decompress if needed). */
  body: string;
  signatureHex: string;
  /** Max age in seconds for timestamp replay protection. Default 5 minutes. */
  maxSkewSeconds?: number;
  nowSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  const maxSkew = input.maxSkewSeconds ?? 300;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'Invalid timestamp' };
  if (Math.abs(now - ts) > maxSkew) return { ok: false, reason: 'Timestamp skew exceeded' };

  const expected = createHmac('sha256', input.securityToken)
    .update(input.nonce, 'utf8')
    .update(input.timestamp, 'utf8')
    .update(input.body, 'utf8')
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(input.signatureHex.toLowerCase(), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'Signature mismatch' };
  }
  return { ok: true };
}

export type NormalizedPoolEvent = {
  dedupeKey: string;
  eventName: string;
  txHash: string | null;
  blockNumber: string | null;
  logIndex: string | null;
  payload: unknown;
};

/**
 * Normalize a Streams/webhook JSON body into dedupe-friendly InsurancePool-ish events.
 * Accepts either raw log arrays or QuickNode dataset wrappers.
 */
export function normalizeStreamsPayload(body: unknown): NormalizedPoolEvent[] {
  const root = body as Record<string, unknown>;
  const candidates: unknown[] = [];
  if (Array.isArray(body)) candidates.push(...body);
  else if (Array.isArray(root?.data)) candidates.push(...(root.data as unknown[]));
  else if (Array.isArray(root?.receipts)) candidates.push(...(root.receipts as unknown[]));
  else if (Array.isArray(root?.logs)) candidates.push(...(root.logs as unknown[]));
  else candidates.push(body);

  const out: NormalizedPoolEvent[] = [];
  for (const item of candidates) {
    const row = item as Record<string, unknown>;
    const txHash = String(row.transactionHash ?? row.txHash ?? row.hash ?? '') || null;
    const blockNumber =
      row.blockNumber !== undefined && row.blockNumber !== null
        ? String(row.blockNumber)
        : null;
    const logIndex =
      row.logIndex !== undefined && row.logIndex !== null ? String(row.logIndex) : null;
    const eventName = String(row.eventName ?? row.name ?? row.event ?? 'unknown');
    const dedupeKey = [
      txHash ?? 'no-tx',
      logIndex ?? 'no-log',
      eventName,
      blockNumber ?? 'no-block',
    ].join(':');
    out.push({ dedupeKey, eventName, txHash, blockNumber, logIndex, payload: item });
  }
  return out;
}
