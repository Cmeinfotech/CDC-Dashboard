import { NextResponse } from 'next/server';
import { requestHasValidOrigin } from '../../../../services/dashboardPasswordAuth.mjs';
import { securityHeaders } from '../../../../services/accessSecurity.mjs';

function clearSessionAndRedirect(request: Request) {
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url, 303);
  for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
  const secure = process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:';
  response.cookies.set({ name: 'cdc_session', value: '', path: '/', httpOnly: true, sameSite: 'lax', secure, expires: new Date(0), maxAge: 0 });
  return response;
}

export async function GET(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403, headers: securityHeaders });
  return clearSessionAndRedirect(request);
}

export async function POST(request: Request) {
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403, headers: securityHeaders });
  return clearSessionAndRedirect(request);
}
