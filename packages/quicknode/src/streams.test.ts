import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { normalizeStreamsPayload, verifyStreamsSignature } from './streams';

describe('QuickNode Streams signature', () => {
  it('accepts valid HMAC and rejects tampering', () => {
    const secret = 'test-security-token';
    const nonce = 'abc123';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ hello: 'world' });
    const signature = createHmac('sha256', secret)
      .update(nonce + timestamp + body)
      .digest('hex');

    expect(
      verifyStreamsSignature({
        securityToken: secret,
        nonce,
        timestamp,
        body,
        signatureHex: signature,
      }),
    ).toEqual({ ok: true });

    expect(
      verifyStreamsSignature({
        securityToken: secret,
        nonce,
        timestamp,
        body: body + 'x',
        signatureHex: signature,
      }).ok,
    ).toBe(false);
  });

  it('normalizes payloads with dedupe keys', () => {
    const events = normalizeStreamsPayload({
      data: [
        {
          eventName: 'PolicyBound',
          transactionHash: '0xaaa',
          logIndex: '1',
          blockNumber: '10',
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.dedupeKey).toBe('0xaaa:1:PolicyBound:10');
  });
});
