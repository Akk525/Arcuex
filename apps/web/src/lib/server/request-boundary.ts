import type { RuntimeConfig } from './runtime-config';

/**
 * Railway public-edge trust model (single service, no private ingress gateway):
 * - TLS terminates at Railway; X-Forwarded-Proto is overwritten to https.
 * - X-Real-IP is overwritten to the observed client IP (use for rate limits).
 * - X-Railway-Edge identifies the edge POP for public traffic.
 * - Private *.railway.internal callers can spoof these headers — do not place
 *   untrusted sibling services that can reach this HTTP port.
 * - Never accept client-supplied x-arcuex-proxy-token / x-arcuex-client-ip.
 */
export function requestBoundaryError(
  request: Request,
  c: RuntimeConfig,
): { status: number; error: string } | null {
  if (!c.enforced) return null;

  // Reject legacy/custom proxy auth headers entirely — they are never authoritative.
  if (request.headers.has('x-arcuex-proxy-token') || request.headers.has('x-arcuex-client-ip')) {
    return { status: 400, error: 'Unsupported ingress identity headers' };
  }

  const host = request.headers.get('host');
  if (host !== c.host) {
    return { status: 400, error: 'Canonical host required' };
  }

  if (c.requireRailwayEdge) {
    const proto = request.headers.get('x-forwarded-proto');
    if (proto !== 'https') {
      return { status: 400, error: 'Canonical HTTPS origin required' };
    }
    const edge = request.headers.get('x-railway-edge')?.trim();
    if (!edge) {
      return { status: 403, error: 'Railway public edge required' };
    }
  } else if (c.profile === 'local-test') {
    // local-test may use http://localhost without Railway headers.
    const proto = request.headers.get('x-forwarded-proto');
    if (proto && proto !== 'https' && proto !== 'http') {
      return { status: 400, error: 'Invalid forwarded proto' };
    }
  }

  const origin = request.headers.get('origin');
  if (origin && origin !== c.origin) {
    return { status: 403, error: 'Cross-origin request rejected' };
  }

  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    return { status: 403, error: 'Cross-site mutation rejected' };
  }

  return null;
}

export function canonicalSigningOrigin(request: Request, c: RuntimeConfig): string {
  return c.enforced ? c.origin : new URL(request.url).origin;
}

export function hasAllowedOrigin(request: Request, c: RuntimeConfig): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === (c.enforced ? c.origin : new URL(request.url).origin);
}

export function securityHeaders(enforced: boolean): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...(enforced ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}
