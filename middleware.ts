import { NextResponse } from 'next/server';
import { accessGuard, authenticatedUser, auditAccess, securityHeaders } from './services/accessSecurity.mjs';

export function middleware(request: Request) {
  const path = new URL(request.url).pathname;
  const blocked = accessGuard(request, { amazon: path.startsWith('/api/amazon/') || path.startsWith('/amazon/') });
  if (blocked) {
    auditAccess(request, blocked.status, null);
    return blocked;
  }
  auditAccess(request, 200, authenticatedUser(request));
  const response = NextResponse.next();
  for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
  if (process.env.NODE_ENV === 'production') response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.svg|og.png).*)'] };
