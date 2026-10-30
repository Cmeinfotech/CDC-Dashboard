import { NextResponse } from 'next/server';
import { accessGuard, authenticatedUser, auditAccess, deploymentConfigurationResponse, securityHeaders } from './services/accessSecurity.mjs';

export function middleware(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const publicAuthPath = path === '/login' || path === '/api/auth/login' || path === '/api/auth/logout';

  if (publicAuthPath) {
    const setupError = deploymentConfigurationResponse();
    if (setupError) return setupError;
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    if (process.env.NODE_ENV === 'production') response.headers.set('Strict-Transport-Security', 'max-age=31536000');
    return response;
  }

  const blocked = accessGuard(request, { amazon: path.startsWith('/api/amazon/') || path.startsWith('/amazon/') });
  if (blocked) {
    auditAccess(request, blocked.status, null);
    if (blocked.status === 401 && ['GET', 'HEAD'].includes(request.method) && !path.startsWith('/api/')) {
      const next = `${path}${url.search}`;
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
    }
    return blocked;
  }
  auditAccess(request, 200, authenticatedUser(request));
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
  if (process.env.NODE_ENV === 'production') response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.svg|og.png).*)'] };
