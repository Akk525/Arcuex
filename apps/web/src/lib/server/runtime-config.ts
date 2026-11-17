import manifest from '../../../../../docs/deployments/arc-testnet-insurance-pool.json';

export const LAUNCH_CHAIN_ID = 5042002;
export const LAUNCH_POOL = manifest.insurancePool as `0x${string}`;

export class ConfigurationError extends Error {
  constructor(readonly fields: string[]) {
    super(`Invalid launch configuration: ${[...new Set(fields)].join(', ')}`);
    this.name = 'ConfigurationError';
  }
}

export type DeploymentProfile = 'development' | 'local-test' | 'public-beta';

export function validateRuntimeEnvironment(env: Record<string, string | undefined>) {
  const enforced = env.NODE_ENV === 'production';
  const profile = (enforced ? env.ARCUEX_DEPLOYMENT_MODE : 'development') as
    | DeploymentProfile
    | undefined;
  const errors: string[] = [];
  const fail = (field: string, ok: unknown) => {
    if (!ok) errors.push(field);
  };
  const value = (name: string, fallback = '') => env[name]?.trim() || fallback;

  const secret = (name: string, required = true) => {
    const v = value(name);
    if (enforced && (required || v)) {
      fail(name, /^[0-9a-f]{64}$/i.test(v));
    }
    return v;
  };

  const number = (name: string, fallback: number, min: number, max: number) => {
    const v = value(name, String(fallback));
    const n = Number(v);
    fail(name, /^[0-9]+$/.test(v) && Number.isSafeInteger(n) && n >= min && n <= max);
    return n;
  };

  if (enforced) {
    fail('ARCUEX_DEPLOYMENT_MODE', profile === 'public-beta' || profile === 'local-test');
  }

  const origin = value('ARCUEX_PUBLIC_ORIGIN');
  let host = '';
  let hostname = '';
  try {
    if (origin) {
      const u = new URL(origin);
      host = u.host;
      hostname = u.hostname;
      const httpsOk = u.protocol === 'https:';
      const localHttpOk =
        profile === 'local-test' &&
        u.protocol === 'http:' &&
        (hostname === 'localhost' || hostname === '127.0.0.1');
      fail(
        'ARCUEX_PUBLIC_ORIGIN',
        u.origin === origin && !u.username && !u.password && (!enforced || httpsOk || localHttpOk),
      );
      if (enforced && profile === 'public-beta') {
        fail(
          'ARCUEX_PUBLIC_ORIGIN',
          !['localhost', '127.0.0.1', '[::1]'].includes(hostname) &&
            hostname.includes('.') &&
            !/\.(test|invalid|example|localhost)$/i.test(hostname),
        );
      }
    } else if (enforced) {
      errors.push('ARCUEX_PUBLIC_ORIGIN');
    }
  } catch {
    errors.push('ARCUEX_PUBLIC_ORIGIN');
  }

  if (enforced) {
    fail('ARCUEX_PUBLIC_HOST', value('ARCUEX_PUBLIC_HOST') === host);
    fail('ARCUEX_TLS_SERVER_NAME', value('ARCUEX_TLS_SERVER_NAME') === hostname);
  }

  const chain = value('ARCUEX_CHAIN_ID', enforced ? '' : '5042002');
  fail('ARCUEX_CHAIN_ID', chain === '5042002');

  const pool = value('ARCUE_X_POOL_ADDRESS', enforced ? '' : LAUNCH_POOL);
  fail('ARCUE_X_POOL_ADDRESS', pool.toLowerCase() === LAUNCH_POOL.toLowerCase());

  const rpc = (name: string, fallback: string) => {
    const v = value(name, fallback);
    try {
      const u = new URL(v);
      const localHttp =
        profile === 'local-test' &&
        u.protocol === 'http:' &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
      fail(
        name,
        !u.username &&
          !u.password &&
          (u.protocol === 'https:' || localHttp || !enforced),
      );
    } catch {
      errors.push(name);
    }
    return v;
  };

  const rpcUrl = rpc('ARC_TESTNET_RPC_URL', 'https://rpc.testnet.arc.io');
  const quicknodeRpcUrl = rpc('QUICKNODE_RPC_URL', 'https://rpc.quicknode.testnet.arc.io');

  const dataDir = value('ARCUEX_DATA_DIR');
  const databasePath = value('ARCUE_X_SQLITE_PATH');
  if (enforced) {
    const allowedRoot =
      dataDir === '/data' ||
      /^\/(var\/lib|srv|mnt|tmp)\//.test(dataDir) ||
      (profile === 'local-test' && dataDir.startsWith('/') && !dataDir.includes('..'));
    fail(
      'ARCUEX_DATA_DIR',
      dataDir.startsWith('/') &&
        !dataDir.includes('..') &&
        !dataDir.endsWith('/') &&
        allowedRoot,
    );
    fail(
      'ARCUE_X_SQLITE_PATH',
      databasePath.startsWith(`${dataDir}/`) &&
        databasePath.endsWith('.sqlite') &&
        !databasePath.includes('..') &&
        !databasePath.includes('\0'),
    );
  }

  // Railway public edge overwrites X-Real-IP / X-Forwarded-*. No client-supplied
  // proxy token is accepted. Rate-limit HMAC secret stays server-only.
  const rateSecret = secret('ARCUEX_RATE_LIMIT_SECRET');
  const reviewerToken = secret('CLAIMS_REVIEWER_API_TOKEN');
  const authorityToken = secret('CLAIMS_AUTHORITY_API_TOKEN');
  const systemToken = secret('CLAIMS_SYSTEM_API_TOKEN', false);
  // Private host-acceptance / pre-public gate. Required for public-beta so a
  // Railway HTTPS domain is not anonymously reachable before authorization.
  const acceptanceGateToken = secret(
    'ARCUEX_ACCEPTANCE_GATE_TOKEN',
    enforced && profile === 'public-beta',
  );

  if (enforced) {
    const secrets = [
      rateSecret,
      reviewerToken,
      authorityToken,
      ...(systemToken ? [systemToken] : []),
      ...(acceptanceGateToken ? [acceptanceGateToken] : []),
    ];
    fail('operator/rate credentials must be distinct', new Set(secrets).size === secrets.length);
    fail('CLAIMS_COOKIE_SECURE', value('CLAIMS_COOKIE_SECURE') === '1');
    fail(
      'CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP',
      !value('CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP') ||
        value('CLAIMS_ALLOW_SYNTHETIC_SETTLEMENT_PREP') === '0',
    );
    // Reject leftover proxy-token wiring — clients must never authenticate ingress.
    if (value('ARCUEX_PROXY_TOKEN')) {
      errors.push('ARCUEX_PROXY_TOKEN must not be set (Railway edge trust model)');
    }
  }

  const sessionEpoch = value('ARCUEX_SESSION_EPOCH', enforced ? '' : 'development');
  if (enforced) {
    fail('ARCUEX_SESSION_EPOCH', /^[a-zA-Z0-9._-]{8,80}$/.test(sessionEpoch));
  }

  const storageId = value('ARCUEX_STORAGE_ID');
  if (enforced) {
    fail('ARCUEX_STORAGE_ID', /^[a-zA-Z0-9_-]{8,80}$/.test(storageId));
  }

  for (const [key, v] of Object.entries(env)) {
    if (!v) continue;
    // Allow public browser RPC endpoints; still forbid secrets in NEXT_PUBLIC_*.
    if (
      enforced &&
      /^NEXT_PUBLIC_/.test(key) &&
      /(?:TOKEN|SECRET|PRIVATE|PASSWORD|API_KEY)/.test(key)
    ) {
      errors.push(key);
    }
    if (enforced && /(?:PRIVATE_KEY|SEED_PHRASE|MNEMONIC)$/.test(key)) {
      errors.push(key);
    }
  }

  const publicPool = value('NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS');
  if (publicPool) {
    fail('NEXT_PUBLIC_ARCUE_X_POOL_ADDRESS', publicPool.toLowerCase() === LAUNCH_POOL.toLowerCase());
  }

  const sessionTtlSeconds = number('ARCUEX_SESSION_TTL_SECONDS', 28800, 900, 28800);
  const nonceTtlSeconds = number('ARCUEX_NONCE_TTL_SECONDS', 600, 60, 600);

  if (errors.length) throw new ConfigurationError(errors);

  return {
    enforced,
    profile: (profile ?? 'development') as DeploymentProfile,
    origin,
    host,
    hostname,
    chainId: LAUNCH_CHAIN_ID,
    pool: LAUNCH_POOL,
    rpcUrl,
    quicknodeRpcUrl,
    dataDir,
    databasePath,
    rateSecret,
    reviewerToken,
    authorityToken,
    systemToken,
    acceptanceGateToken,
    sessionEpoch,
    storageId,
    sessionTtlSeconds,
    nonceTtlSeconds,
    secureCookies: enforced || value('CLAIMS_COOKIE_SECURE') === '1',
    requireRailwayEdge: enforced && profile === 'public-beta',
    requireAcceptanceGate: enforced && profile === 'public-beta' && Boolean(acceptanceGateToken),
  };
}

export type RuntimeConfig = ReturnType<typeof validateRuntimeEnvironment>;

let cached: RuntimeConfig | undefined;

export function getRuntimeConfig(): RuntimeConfig {
  // Avoid stale secrets in vitest / local reloads when env mutates between calls.
  if (process.env.NODE_ENV !== 'production') {
    return validateRuntimeEnvironment(process.env);
  }
  if (!cached) cached = validateRuntimeEnvironment(process.env);
  return cached;
}

/** Test helper — clears memoized production config after env mutations. */
export function resetRuntimeConfigCache(): void {
  cached = undefined;
}
