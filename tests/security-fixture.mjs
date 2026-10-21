import { generateKeyPairSync, sign } from 'node:crypto';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
export const authEnv = {
  AUTH_JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }),
  AUTH_JWT_ISSUER: 'https://identity.test', AUTH_JWT_AUDIENCE: 'cdc-test',
  AUTH_USERS_JSON: JSON.stringify([{ subject: 'test-subject', userId: 'test-person', enabled: true, accounts: ['cdc'] }]),
};
export function testToken(patch = {}, header = { alg: 'RS256' }) {
  const now = Math.floor(Date.now() / 1000);
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encoded(header)}.${encoded({ iss: authEnv.AUTH_JWT_ISSUER, aud: authEnv.AUTH_JWT_AUDIENCE, sub: 'test-subject', iat: now, exp: now + 600, amr: ['mfa'], ...patch })}`;
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
}
