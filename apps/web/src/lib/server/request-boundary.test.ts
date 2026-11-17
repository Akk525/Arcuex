import { describe, expect, it } from 'vitest';
import { requestBoundaryError } from './request-boundary';
import type { RuntimeConfig } from './runtime-config';

function cfg(partial: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    enforced: true,
    profile: 'public-beta',
    origin: 'https://beta.example.com',
    host: 'beta.example.com',
    hostname: 'beta.example.com',
    chainId: 5042002,
    pool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
    rpcUrl: 'https://rpc.testnet.arc.io',
    quicknodeRpcUrl: 'https://rpc.quicknode.testnet.arc.io',
    dataDir: '/data',
    databasePath: '/data/arcuex.sqlite',
    rateSecret: 'ab'.repeat(32),
    reviewerToken: 'cd'.repeat(32),
    authorityToken: 'ef'.repeat(32),
    systemToken: '',
    acceptanceGateToken: '11'.repeat(32),
    sessionEpoch: 'launch-2026-11-20',
    storageId: 'vol-arcuex-beta-01',
    sessionTtlSeconds: 28800,
    nonceTtlSeconds: 600,
    secureCookies: true,
    requireRailwayEdge: true,
    requireAcceptanceGate: true,
    ...partial,
  };
}

describe('requestBoundaryError', () => {
  it('accepts Railway public-edge requests with acceptance gate', () => {
    const request = new Request('https://beta.example.com/api/policies', {
      headers: {
        host: 'beta.example.com',
        'x-forwarded-proto': 'https',
        'x-railway-edge': 'us-west2',
        'x-real-ip': '203.0.113.10',
        'x-arcuex-acceptance-gate': '11'.repeat(32),
      },
    });
    expect(requestBoundaryError(request, cfg({}))).toBeNull();
  });

  it('rejects missing acceptance gate in public-beta', () => {
    const request = new Request('https://beta.example.com/api/policies', {
      headers: {
        host: 'beta.example.com',
        'x-forwarded-proto': 'https',
        'x-railway-edge': 'us-west2',
      },
    });
    expect(requestBoundaryError(request, cfg({}))?.status).toBe(401);
  });

  it('rejects client-supplied proxy identity headers', () => {
    const request = new Request('https://beta.example.com/api/policies', {
      headers: {
        host: 'beta.example.com',
        'x-forwarded-proto': 'https',
        'x-railway-edge': 'us-west2',
        'x-arcuex-acceptance-gate': '11'.repeat(32),
        'x-arcuex-proxy-token': 'ab'.repeat(32),
      },
    });
    expect(requestBoundaryError(request, cfg({}))?.status).toBe(400);
  });

  it('rejects missing Railway edge marker in public-beta', () => {
    const request = new Request('https://beta.example.com/api/policies', {
      headers: {
        host: 'beta.example.com',
        'x-forwarded-proto': 'https',
        'x-arcuex-acceptance-gate': '11'.repeat(32),
      },
    });
    expect(requestBoundaryError(request, cfg({}))?.error).toMatch(/Railway public edge/);
  });

  it('rejects cross-origin mutations', () => {
    const request = new Request('https://beta.example.com/api/claims', {
      method: 'POST',
      headers: {
        host: 'beta.example.com',
        'x-forwarded-proto': 'https',
        'x-railway-edge': 'us-west2',
        'x-arcuex-acceptance-gate': '11'.repeat(32),
        origin: 'https://evil.example',
      },
    });
    expect(requestBoundaryError(request, cfg({}))?.status).toBe(403);
  });
});
