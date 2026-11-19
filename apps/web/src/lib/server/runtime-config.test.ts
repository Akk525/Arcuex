import { afterEach, describe, expect, it } from 'vitest';
import {
  ConfigurationError,
  LAUNCH_POOL,
  resetRuntimeConfigCache,
  validateRuntimeEnvironment,
} from './runtime-config';

const hex64 = 'ab'.repeat(32);
const hex64b = 'cd'.repeat(32);
const hex64c = 'ef'.repeat(32);

function basePublicBeta(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'production',
    ARCUEX_CHAIN_SOURCE: 'arc-testnet',
    ARCUEX_DEPLOYMENT_MODE: 'public-beta',
    ARCUEX_PUBLIC_ORIGIN: 'https://beta.example.com',
    ARCUEX_PUBLIC_HOST: 'beta.example.com',
    ARCUEX_TLS_SERVER_NAME: 'beta.example.com',
    ARCUEX_CHAIN_ID: '5042002',
    ARCUE_X_POOL_ADDRESS: LAUNCH_POOL,
    ARC_TESTNET_RPC_URL: 'https://rpc.testnet.arc.io',
    QUICKNODE_RPC_URL: 'https://rpc.quicknode.testnet.arc.io',
    ARCUEX_DATA_DIR: '/data',
    ARCUE_X_SQLITE_PATH: '/data/arcuex.sqlite',
    ARCUEX_RATE_LIMIT_SECRET: hex64,
    CLAIMS_REVIEWER_API_TOKEN: hex64b,
    CLAIMS_AUTHORITY_API_TOKEN: hex64c,
    ARCUEX_ACCEPTANCE_GATE_TOKEN: '12'.repeat(32),
    CLAIMS_COOKIE_SECURE: '1',
    ARCUEX_SESSION_EPOCH: 'launch-2026-11-20',
    ARCUEX_STORAGE_ID: 'vol-arcuex-beta-01',
    ...overrides,
  };
}

afterEach(() => {
  resetRuntimeConfigCache();
});

describe('validateRuntimeEnvironment', () => {
  it('accepts a complete Railway public-beta configuration', () => {
    const cfg = validateRuntimeEnvironment(basePublicBeta());
    expect(cfg.profile).toBe('public-beta');
    expect(cfg.requireRailwayEdge).toBe(true);
    expect(cfg.databasePath).toBe('/data/arcuex.sqlite');
    expect(cfg.secureCookies).toBe(true);
  });

  it('rejects ARCUEX_PROXY_TOKEN in production', () => {
    expect(() => validateRuntimeEnvironment(basePublicBeta({ ARCUEX_PROXY_TOKEN: hex64 }))).toThrow(
      ConfigurationError,
    );
  });

  it('rejects synthetic settlement prep in production', () => {
    expect(() =>
      validateRuntimeEnvironment(basePublicBeta({ CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP: '1' })),
    ).toThrow(/CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP/);
  });

  it('rejects private keys in production env', () => {
    expect(() =>
      validateRuntimeEnvironment(basePublicBeta({ DEPLOYER_PRIVATE_KEY: '0xabc' })),
    ).toThrow(/PRIVATE_KEY/);
  });

  it('allows public browser RPC URLs while rejecting NEXT_PUBLIC secrets', () => {
    expect(() =>
      validateRuntimeEnvironment(
        basePublicBeta({
          NEXT_PUBLIC_ARC_RPC_URL: 'https://rpc.testnet.arc.io',
          NEXT_PUBLIC_QUICKNODE_RPC_URL: 'https://rpc.quicknode.testnet.arc.io',
        }),
      ),
    ).not.toThrow();
    expect(() =>
      validateRuntimeEnvironment(basePublicBeta({ NEXT_PUBLIC_CLAIMS_AUTHORITY_API_TOKEN: hex64 })),
    ).toThrow(/NEXT_PUBLIC_CLAIMS_AUTHORITY_API_TOKEN/);
  });

  it('allows local-test http origin for smoke drills', () => {
    const cfg = validateRuntimeEnvironment(
      basePublicBeta({
        ARCUEX_DEPLOYMENT_MODE: 'local-test',
        ARCUEX_PUBLIC_ORIGIN: 'http://localhost:3003',
        ARCUEX_PUBLIC_HOST: 'localhost:3003',
        ARCUEX_TLS_SERVER_NAME: 'localhost',
        ARCUEX_DATA_DIR: '/tmp/arcuex-launch-test',
        ARCUE_X_SQLITE_PATH: '/tmp/arcuex-launch-test/arcuex.sqlite',
      }),
    );
    expect(cfg.profile).toBe('local-test');
    expect(cfg.requireRailwayEdge).toBe(false);
  });
});
