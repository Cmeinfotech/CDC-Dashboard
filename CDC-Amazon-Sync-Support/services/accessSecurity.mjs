import { createHash, createPublicKey, verify } from 'node:crypto';
import { verifyDashboardSession } from './dashboardPasswordAuth.mjs';

export const securityHeaders = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const deny = (status, message) => Response.json({ error: message }, { status, headers: securityHeaders });
export function auditAccess(request, status, user) {
  if (process.env.NODE_ENV !== 'production') return;
  // Do not log credentials, query parameters, buyer data or untrusted identity headers.
  console.info(JSON.stringify({ event: 'access_decision', timestamp: new Date().toISOString(), method: request.method,
    resource: new URL(request.url).pathname.startsWith('/api/amazon/') ? 'amazon-api' : 'dashboard', status,
    principal: user ? createHash('sha256').update(user.subject).digest('hex') : 'unauthenticated' }));
}
export function authenticatedUser(request, env = process.env, now = Date.now()) {
  const bearer = request.headers.get('authorization');
  const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('cdc_session='))?.slice(12);
  if (cookie?.startsWith('pwd1.')) return verifyDashboardSession(cookie, env, now);
  const token = bearer?.startsWith('Bearer ') ? bearer.slice(7) : cookie;
  if (!token || token.length > 16000) throw Error('Sign in to the dashboard.');
  if (!env.AUTH_JWT_PUBLIC_KEY || !env.AUTH_JWT_ISSUER || !env.AUTH_JWT_AUDIENCE || !env.AUTH_USERS_JSON) throw Error('Secure access is not configured.');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(v => !/^[A-Za-z0-9_-]+$/.test(v))) throw Error('Invalid session.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  if (header.alg !== 'RS256' || header.crit || header.jku || header.x5u) throw Error('Invalid session algorithm.');
  const key = createPublicKey(env.AUTH_JWT_PUBLIC_KEY.replace(/\\n/g, '\n'));
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails?.modulusLength < 2048) throw Error('Invalid identity signing key.');
  if (!verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'))) throw Error('Invalid session signature.');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); const seconds = Math.floor(now / 1000);
  if (claims.iss !== env.AUTH_JWT_ISSUER || !(claims.aud === env.AUTH_JWT_AUDIENCE || Array.isArray(claims.aud) && claims.aud.includes(env.AUTH_JWT_AUDIENCE)) ||
      !Number.isInteger(claims.exp) || claims.exp <= seconds || !Number.isInteger(claims.iat) || claims.iat > seconds || claims.exp - claims.iat > 900 ||
      claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > seconds) || !Array.isArray(claims.amr) || !claims.amr.includes('mfa')) throw Error('Expired session or MFA verification missing.');
  const users = JSON.parse(env.AUTH_USERS_JSON);
  const user = users.find(v => v.subject === claims.sub && v.enabled === true);
  if (!user || typeof user.userId !== 'string' || !/^[a-zA-Z0-9@._-]{1,128}$/.test(user.userId) || !Array.isArray(user.accounts)) throw Error('Account access is not approved.');
  // Main administrator is selected by server configuration, never by client claims.
  return env.AUTH_MAIN_ADMIN_USER_ID === user.userId ? { ...user, role: 'main-admin', accounts: ['cdc', 'nana-jewellers'] } : user;
}
export function accessGuard(request, { amazon = false } = {}) {
  try {
    const url = new URL(request.url);
    if (process.env.NODE_ENV === 'production' && (!process.env.APP_ORIGIN || !process.env.APP_ORIGIN.startsWith('https://'))) return deny(503, 'Secure HTTPS deployment is not configured.');
    if (process.env.NODE_ENV === 'production' && process.env.SECURITY_DEPLOYMENT_VERIFIED !== 'true') return deny(503, 'Production security review and deployment setup are required.');
    const user = authenticatedUser(request);
    const account = request.headers.get('x-cdc-account-id') || 'cdc';
    if (!['cdc', 'nana-jewellers'].includes(account) || !user.accounts.includes(account) || amazon && account !== 'cdc') return deny(403, 'Account access denied.');
    if (account === 'cdc' && process.env.AMAZON_ACCESS_REVOKED === 'true') return deny(403, 'Amazon authorization revoked; data access is disabled.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (!origin || origin !== (process.env.APP_ORIGIN || url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return deny(403, 'Cross-site request denied.');
    }
    return null;
  } catch { return deny(401, 'Dashboard sign-in is required.'); }
}

export function deploymentConfigurationError(env = process.env) {
  if (env.NODE_ENV === 'production' && (!env.APP_ORIGIN || !env.APP_ORIGIN.startsWith('https://'))) return 'Secure HTTPS deployment is not configured.';
  if (env.NODE_ENV === 'production' && env.SECURITY_DEPLOYMENT_VERIFIED !== 'true') return 'Production security review and deployment setup are required.';
  return null;
}

export function deploymentConfigurationResponse() {
  const error = deploymentConfigurationError();
  return error ? deny(503, error) : null;
}
