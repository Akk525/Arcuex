import { describe, expect, it, vi } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { getDb, getRepo } from '@/lib/server/db';
import { issueClaimsNonce } from '@/lib/server/claims-session';
import { authenticateMcpToken, issueMcpToken, tokenId } from './tokens';

async function issue() {
  const account = privateKeyToAccount(generatePrivateKey());
  const challenge = issueClaimsNonce(getRepo(), account.address);
  return issueMcpToken({
    nonce: challenge.nonce,
    signature: await account.signMessage({ message: challenge.message }),
    scopes: ['arcuex:read'],
    clientName: 'token-expiry-test',
  });
}

describe('MCP token lifetime', () => {
  it('never outlives its backing wallet session and stores no raw token', async () => {
    const issued = await issue();
    expect(authenticateMcpToken(issued.accessToken).ok).toBe(true);
    const rows = getDb().prepare('SELECT * FROM mcp_access_tokens').all();
    expect(JSON.stringify(rows)).not.toContain(issued.accessToken);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(issued.expiresAt) + 1000);
    try {
      expect(authenticateMcpToken(issued.accessToken)).toMatchObject({
        ok: false,
        reasonCode: 'TOKEN_EXPIRED',
      });
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects a token whose sealed session was swapped', async () => {
    const [a, b] = [await issue(), await issue()];
    const sealedB = getDb()
      .prepare('SELECT sealed_session FROM mcp_access_tokens WHERE id = ?')
      .get(tokenId(b.accessToken)) as { sealed_session: string };
    getDb()
      .prepare('UPDATE mcp_access_tokens SET sealed_session = ? WHERE id = ?')
      .run(sealedB.sealed_session, tokenId(a.accessToken));
    expect(authenticateMcpToken(a.accessToken)).toMatchObject({
      ok: false,
      reasonCode: 'TOKEN_INVALID',
    });
  });
});
