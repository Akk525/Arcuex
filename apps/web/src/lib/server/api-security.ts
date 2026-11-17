import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb } from './db';
import { DurableRateLimiter, verifiedClientIp } from './rate-limit';
import { requestBoundaryError, securityHeaders } from './request-boundary';
import { getRuntimeConfig } from './runtime-config';

export function withApiSecurity<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      const c = getRuntimeConfig();
      const error = requestBoundaryError(request, c);
      if (error) {
        return NextResponse.json(
          { error: error.error },
          { status: error.status, headers: { 'Cache-Control': 'no-store' } },
        );
      }

      if (c.enforced) {
        const path = new URL(request.url).pathname;
        const ip = verifiedClientIp(request, true);
        const auth = path.includes('/auth/') || path === '/api/procurement';
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
        const limiter = new DurableRateLimiter(getDb(), c.rateSecret);

        if (mutation && !path.includes('/auth/')) {
          const hold = getDb()
            .prepare("SELECT value FROM launch_runtime_state WHERE key = 'recovery_hold'")
            .get() as { value: string } | undefined;
          if (hold?.value === '1') {
            return NextResponse.json(
              { error: 'Recovery review required before mutations resume' },
              { status: 503, headers: { 'Cache-Control': 'no-store' } },
            );
          }
        }

        const checks = [limiter.consume('all-ip', ip, 300, 60)];
        if (auth) {
          checks.push(limiter.consume('authentication-ip', ip, 20, 60));
        } else if (mutation) {
          checks.push(limiter.consume('mutation-ip', ip, 60, 60));
        }
        const cookie = request.headers.get('cookie');
        if (mutation && cookie) {
          checks.push(
            limiter.consume(
              'mutation-session',
              createHash('sha256').update(cookie).digest('hex'),
              60,
              60,
            ),
          );
        }
        const blocked = checks.find((v) => !v.allowed);
        if (blocked) {
          return NextResponse.json(
            { error: 'Request rate limit exceeded' },
            {
              status: 429,
              headers: {
                'Retry-After': String(blocked.retryAfter),
                'Cache-Control': 'no-store',
              },
            },
          );
        }
      }

      let secured = request;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.body) {
        const max = new URL(request.url).pathname.includes('/webhooks/') ? 262_144 : 65_536;
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > max) {
            await reader.cancel();
            return NextResponse.json(
              { error: 'Request too large' },
              { status: 413, headers: { 'Cache-Control': 'no-store' } },
            );
          }
          chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let at = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, at);
          at += chunk.length;
        }
        secured = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: bytes,
        });
      }

      const response = await handler(secured, ...args);
      for (const [key, value] of Object.entries(securityHeaders(c.enforced))) {
        response.headers.set(key, value);
      }
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }
      const detail =
        process.env.ARCUEX_DEPLOYMENT_MODE === 'local-test' && error instanceof Error
          ? error.message
          : 'Request unavailable; no server transaction was sent';
      return NextResponse.json(
        { error: detail },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}
