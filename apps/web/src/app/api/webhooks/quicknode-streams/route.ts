import {withApiSecurity} from '@/lib/server/api-security';
import { NextResponse } from 'next/server';
import { gunzipSync } from 'node:zlib';
import { newId } from '@arcuex/domain';
import {
  normalizeStreamsPayload,
  parseStreamsHeaders,
  verifyStreamsSignature,
} from '@arcuex/quicknode/streams';
import { getRepo } from '@/lib/server/db';

export const runtime = 'nodejs';

/**
 * Authenticated QuickNode Streams webhook receiver.
 * Transport auth ≠ financial authorization. Never settles claims from this route.
 *
 * Provisioning (when credentials exist):
 * 1. Create Arc Testnet Stream filtered to InsurancePool address
 * 2. Set destination webhook URL to https://<public-host>/api/webhooks/quicknode-streams
 * 3. Set QUICKNODE_STREAMS_WEBHOOK_SECRET to the Stream security token
 * 4. Prefer compression=none during bring-up; gzip is supported here
 */
async function POSTHandler(request: Request) {
  const secret = process.env.QUICKNODE_STREAMS_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Streams receiver ready but QUICKNODE_STREAMS_WEBHOOK_SECRET unset',
        blocker:
          'Provision QuickNode Streams credentials + public webhook host. RPC polling ≠ Streams.',
      },
      { status: 503 },
    );
  }

  const headers = parseStreamsHeaders(request.headers);
  if (!headers) {
    return NextResponse.json({ ok: false, error: 'Missing X-QN-* signature headers' }, { status: 401 });
  }

  const encoding = request.headers.get('content-encoding')?.toLowerCase();
  const rawBuf = Buffer.from(await request.arrayBuffer());
  let bodyText: string;
  try {
    bodyText =
      encoding === 'gzip'
        ? gunzipSync(rawBuf,{maxOutputLength:1048576}).toString('utf8')
        : rawBuf.toString('utf8');
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to decode body' }, { status: 400 });
  }

  const verified = verifyStreamsSignature({
    securityToken: secret,
    nonce: headers.nonce,
    timestamp: headers.timestamp,
    body: bodyText,
    signatureHex: headers.signature,
  });
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 401 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const events = normalizeStreamsPayload(parsed);
  const repo = getRepo();
  let inserted = 0;
  let duplicates = 0;
  const now = new Date().toISOString();

  for (const event of events) {
    const ok = repo.insertStreamsEvent({
      id: newId(),
      dedupeKey: event.dedupeKey,
      source: 'quicknode-streams',
      eventName: event.eventName,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      payload: event.payload,
      signatureOk: true,
      receivedAt: now,
    });
    if (ok) inserted += 1;
    else duplicates += 1;
  }

  repo.insertAudit('streams', 'inbox', 'streams.webhook_accepted', {
    inserted,
    duplicates,
    eventCount: events.length,
    note: 'Authenticated transport only — not claim authorization',
  });

  return NextResponse.json({
    ok: true,
    inserted,
    duplicates,
    note: 'Stored in streams_inbox. Does not authorize payouts.',
  });
}

async function GETHandler() {
  const configured = Boolean(process.env.QUICKNODE_STREAMS_WEBHOOK_SECRET?.trim());
  return NextResponse.json({
    service: 'quicknode-streams-webhook',
    configured,
    streamsComplete: false,
    note: configured
      ? 'Secret present — awaiting live Stream deliveries to a public URL'
      : 'Set QUICKNODE_STREAMS_WEBHOOK_SECRET and expose a public HTTPS endpoint',
  });
}

export const GET=withApiSecurity(GETHandler);
export const POST=withApiSecurity(POSTHandler);
