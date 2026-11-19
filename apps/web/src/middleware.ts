import { NextResponse, type NextRequest } from 'next/server';
import { requestBoundaryError, securityHeaders } from './lib/server/request-boundary';
import { getRuntimeConfig, ConfigurationError } from './lib/server/runtime-config';

export function middleware(request: NextRequest) {
  // Liveness must not depend on env validation so Railway can detect a crashed boot.
  if (request.nextUrl.pathname === '/api/health/live') {
    return NextResponse.next();
  }

  try {
    const c = getRuntimeConfig();
    const error = requestBoundaryError(request, c);
    if (error) {
      return NextResponse.json(
        { error: error.error },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const response = NextResponse.next();
    for (const [k, v] of Object.entries(securityHeaders(c.enforced))) {
      response.headers.set(k, v);
    }
    if (request.nextUrl.pathname.startsWith('/api/')) {
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Service configuration invalid',
        ...(process.env.ARCUEX_DEPLOYMENT_MODE === 'local-test' &&
        error instanceof ConfigurationError
          ? { fields: error.fields }
          : {}),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
