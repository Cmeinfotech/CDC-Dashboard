import { NextResponse } from 'next/server';
import {
  createDashboardSession,
  dashboardSessionCookie,
  passwordLoginConfigurationError,
  verifyDashboardCredentials,
  requestHasValidOrigin,
} from '../../../../services/dashboardPasswordAuth.mjs';
import { deploymentConfigurationError, securityHeaders } from '../../../../services/accessSecurity.mjs';
import { boundedBytes } from '../../../../services/boundedBody.mjs';

export async function POST(request: Request) {
  const setupError = deploymentConfigurationError();
  if (setupError) return NextResponse.json({ error: setupError }, { status: 503, headers: securityHeaders });
  const configError = passwordLoginConfigurationError();
  if (configError) return NextResponse.json({ error: configError }, { status: 503, headers: securityHeaders });
  if (!requestHasValidOrigin(request)) return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403, headers: securityHeaders });

  let body: { username?: unknown; password?: unknown };
  try {
    const bytes = await boundedBytes(request, 4096);
    const parsed: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400, headers: securityHeaders });
    body = parsed as { username?: unknown; password?: unknown };
  } catch (error) {
    if (error instanceof Error && error.message.includes('size limit')) return NextResponse.json({ error: 'Invalid login request.' }, { status: 413, headers: securityHeaders });
    return NextResponse.json({ error: 'Enter your username and password.' }, { status: 400, headers: securityHeaders });
  }
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (username.length > 128 || password.length > 1024) return NextResponse.json({ error: 'Username or password is incorrect.' }, { status: 401, headers: securityHeaders });

  const result = verifyDashboardCredentials(username, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: securityHeaders });
  const token = createDashboardSession(result.username);
  const secure = process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:';
  const response = NextResponse.json({ ok: true }, { headers: { ...securityHeaders, 'Cache-Control': 'no-store' } });
  response.cookies.set({ name: 'cdc_session', value: token, path: '/', httpOnly: true, sameSite: 'lax', secure });
  return response;
}
