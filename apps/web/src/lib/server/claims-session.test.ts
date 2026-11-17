import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import {
  issueClaimsNonce,
  loadPrincipalFromSession,
  verifyWalletAndCreateSession,
} from './claims-session';

describe('claims wallet sessions', () => {
  it('issues single-use nonces and binds session to signed wallet', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = issueClaimsNonce(repo, account.address);
    const signature = await account.signMessage({ message: issued.message });
    const session = await verifyWalletAndCreateSession(repo, {
      wallet: account.address,
      nonce: issued.nonce,
      signature,
    });
    expect(session.principal.role).toBe('claimant');
    expect(session.principal.walletAddress?.toLowerCase()).toBe(account.address.toLowerCase());

    await expect(
      verifyWalletAndCreateSession(repo, {
        wallet: account.address,
        nonce: issued.nonce,
        signature,
      }),
    ).rejects.toThrow(/used|Unknown/i);

    const loaded = loadPrincipalFromSession(repo, session.sessionId);
    expect(loaded?.role).toBe('claimant');
  });

  it('does not grant authority from wallet session alone', async () => {
    const repo = new InsuranceRepository(openDatabase(':memory:'));
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = issueClaimsNonce(repo, account.address);
    const signature = await account.signMessage({ message: issued.message });
    const session = await verifyWalletAndCreateSession(repo, {
      wallet: account.address,
      nonce: issued.nonce,
      signature,
    });
    expect(session.principal.role).toBe('claimant');
    expect(session.principal.allowSyntheticSettlementPrep).toBeFalsy();
  });
});

it('rejects changed messages, expired nonces and concurrent nonce replay', async () => {
  const repo = new InsuranceRepository(openDatabase()),
    account = privateKeyToAccount(generatePrivateKey());
  const c = issueClaimsNonce(repo, account.address, 'https://arcuex.example');
  expect(c.message).toContain('Origin: https://arcuex.example');
  await expect(
    verifyWalletAndCreateSession(repo, {
      wallet: account.address,
      nonce: c.nonce,
      signature: await account.signMessage({ message: c.message + ' changed' }),
    }),
  ).rejects.toThrow();
  const signature = await account.signMessage({ message: c.message });
  const results = await Promise.allSettled([
    verifyWalletAndCreateSession(repo, { wallet: account.address, nonce: c.nonce, signature }),
    verifyWalletAndCreateSession(repo, { wallet: account.address, nonce: c.nonce, signature }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  repo.insertClaimsAuthNonce({
    nonce: 'expired',
    walletAddress: account.address.toLowerCase(),
    message: 'expired',
    expiresAt: '2000-01-01T00:00:00.000Z',
  });
  await expect(
    verifyWalletAndCreateSession(repo, { wallet: account.address, nonce: 'expired', signature }),
  ).rejects.toThrow('expired');
});
