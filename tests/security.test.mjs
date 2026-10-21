import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { authenticatedUser, accessGuard } from '../services/accessSecurity.mjs';
import { amazonFetch, amazonEndpoint, amazonUrl, reportDownloadUrl, retryDelay } from '../services/amazonTransport.mjs';
import { minimizeAmazonData, sealAmazonData, openAmazonData, purgeExpiredAmazonData } from '../services/amazonDataSecurity.mjs';
import { authEnv, testToken } from './security-fixture.mjs';
import { boundedBytes } from '../services/boundedBody.mjs';

test('login-free development is loopback-only and cannot grant production or cross-site access', () => {
  const env={NODE_ENV:'development',LOCAL_DASHBOARD_ACCESS:'true'};
  assert.equal(authenticatedUser(new Request('http://127.0.0.1:5173/'),env).userId,'dashboard');
  for(const [url,headers] of [['http://public.test/',{}],['http://localhost:5173/',{'sec-fetch-site':'cross-site'}],['http://localhost:5173/',{origin:'https://evil.test'}]])
    assert.throws(()=>authenticatedUser(new Request(url,{headers}),env));
  assert.throws(()=>authenticatedUser(new Request('http://localhost:5173/'),{...env,NODE_ENV:'production'}));
});

test('authentication rejects spoofed headers, tampering, wrong issuer/audience and missing MFA', () => {
  const request = (token, extra = {}) => new Request('https://dashboard.test/api/amazon/monitor', { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra } });
  assert.throws(() => authenticatedUser(request(null, { 'oai-authenticated-user-id': 'admin' }), authEnv));
  assert.equal(authenticatedUser(request(testToken()), authEnv).userId, 'test-person');
  assert.equal(authenticatedUser(request(null, { cookie: `cdc_session=${testToken()}` }), authEnv).userId, 'test-person');
  for (const patch of [{ iss: 'https://attacker.test' }, { aud: 'other' }, { exp: 0 }, { iat: 9999999999 }, { amr: ['pwd'] }, { sub: 'unapproved' }]) assert.throws(() => authenticatedUser(request(testToken(patch)), authEnv));
  const token = testToken().split('.'); token[1] = Buffer.from(JSON.stringify({ sub: 'admin' })).toString('base64url');
  assert.throws(() => authenticatedUser(request(token.join('.')), authEnv));
  assert.throws(() => authenticatedUser(request(testToken({}, { alg: 'HS256' })), authEnv));
});
test('account authorization, revocation and CSRF checks fail closed', () => {
  const previous = { ...process.env }; Object.assign(process.env, authEnv); process.env.NODE_ENV = 'test'; process.env.APP_ORIGIN = 'https://dashboard.test';
  try {
    const req = (headers = {}, method = 'GET') => new Request('https://dashboard.test/api/amazon/sync', { method, headers: { authorization: `Bearer ${testToken()}`, ...headers } });
    assert.equal(accessGuard(req()), null);
    assert.equal(accessGuard(req({ 'x-cdc-account-id': 'nana-jewellers' }))?.status, 403);
  } finally { for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key]; Object.assign(process.env, previous); }
});
test('write access requires same-origin and approved account; revoked access stops reads', () => {
  const keys = [...Object.keys(authEnv), 'NODE_ENV', 'APP_ORIGIN', 'AMAZON_ACCESS_REVOKED']; const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, authEnv, { NODE_ENV: 'test', APP_ORIGIN: 'https://dashboard.test' });
  const request = (method, extra = {}) => new Request('https://dashboard.test/api/amazon/sync', { method, headers: { authorization: `Bearer ${testToken()}`, ...extra } });
  try {
    assert.equal(accessGuard(request('POST'))?.status, 403);
    assert.equal(accessGuard(request('POST', { origin: 'https://evil.test' }))?.status, 403);
    assert.equal(accessGuard(request('POST', { origin: 'https://dashboard.test' })), null);
    assert.equal(accessGuard(request('GET', { 'x-cdc-account-id': 'nana-jewellers' }), { amazon: true })?.status, 403);
    process.env.AMAZON_ACCESS_REVOKED = 'true'; assert.equal(accessGuard(request('GET'))?.status, 403);
  } finally { for (const [k,v] of Object.entries(previous)) if(v === undefined) delete process.env[k]; else process.env[k]=v; }
});
test('encrypted data rejects tampering, moved files, expired data and plaintext', () => {
  const old = process.env.AMAZON_DATA_KEY; process.env.AMAZON_DATA_KEY = 'ab'.repeat(32);
  try {
    const file = path.resolve('data-store/test.json'); const now = Date.now();
    const sealed = sealAmazonData({ sku: 'SECRET-SKU', BuyerInfo: { email: 'private@test' }, 'ship-address-1': 'secret address' }, file, now);
    assert(!sealed.includes('SECRET-SKU')); assert.deepEqual(openAmazonData(sealed, file), { sku: 'SECRET-SKU' });
    assert.throws(() => openAmazonData(sealed, file + 'other'));
    const changed = JSON.parse(sealed); changed.expiresAt++; assert.throws(() => openAmazonData(JSON.stringify(changed), file));
    assert.equal(openAmazonData(sealed, file, null, now + 181 * 86400000), null);
    assert.throws(() => openAmazonData('{"sku":"plaintext"}', file));
    assert.deepEqual(minimizeAmazonData([{ BuyerEmail: 'secret', units: 3 }]), [{ units: 3 }]);
  } finally { if (old === undefined) delete process.env.AMAZON_DATA_KEY; else process.env.AMAZON_DATA_KEY=old; }
});
test('retention only deletes authenticated expired envelopes inside the supplied directory', async () => {
  const old = process.env.AMAZON_DATA_KEY; process.env.AMAZON_DATA_KEY = 'ab'.repeat(32);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-security-'));
  try {
    const expired = path.join(root, 'old.json'), current = path.join(root, 'new.json');
    await fs.writeFile(expired, sealAmazonData({ units: 1 }, expired, Date.now() - 181 * 86400000));
    await fs.writeFile(current, sealAmazonData({ units: 2 }, current));
    assert.equal(await purgeExpiredAmazonData(root), 1); assert.equal((await fs.readdir(root)).length, 1);
  } finally { const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root)); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); await fs.rm(root, { recursive: true, force: true }); if(old===undefined) delete process.env.AMAZON_DATA_KEY; else process.env.AMAZON_DATA_KEY=old; }
});
test('transport blocks credential exfiltration and untrusted report URLs', () => {
  assert.throws(() => amazonEndpoint('na', 'https://evil.test'));
  assert.throws(() => amazonUrl('https://evil.test/x', amazonEndpoint('na')));
  assert.throws(() => amazonUrl('//evil.test/x', amazonEndpoint('na')));
  for (const url of ['http://bucket.s3.amazonaws.com/x', 'https://amazonaws.com.evil.test/x', 'https://127.0.0.1/x', 'https://user:password@bucket.s3.amazonaws.com/x']) assert.throws(() => reportDownloadUrl(url));
  assert.equal(reportDownloadUrl('https://bucket.s3.amazonaws.com/x').protocol, 'https:');
});
test('retains only numeric gift-wrap amounts and still removes gift content and customer data', () => {
  const cleaned = minimizeAmazonData({
    'gift-wrap-price': '2.50', 'gift-wrap-tax': { CurrencyCode: 'USD', Amount: 0.2 },
    'gift-message-text': 'Happy birthday', buyerEmail: 'customer@example.test', GiftWrapPrice: { Amount: 3, CurrencyCode: 'USD', note: 'no' }
  });
  assert.equal(cleaned['gift-wrap-price'], '2.50'); assert.deepEqual(cleaned['gift-wrap-tax'], { CurrencyCode: 'USD', Amount: 0.2 });
  assert.equal(cleaned['gift-message-text'], undefined); assert.equal(cleaned.buyerEmail, undefined); assert.equal(cleaned.GiftWrapPrice, undefined);
});
test('429 honors retry-after, safe GET retries 503, ambiguous POST never retries', async () => {
  const delays = []; let calls=0;
  const result = await amazonFetch('https://amazon.test', {}, { fetchImpl: async () => ++calls === 1 ? new Response('', { status:429, headers:{ 'Retry-After':'120' } }) : new Response('ok'), sleep:async value => delays.push(value) });
  assert.equal(result.status,200); assert.equal(calls,2); assert(delays[0]>=120000);
  calls=0; await amazonFetch('https://amazon.test', { method:'POST' }, { fetchImpl:async () => {calls++; return new Response('',{status:503});}, sleep:async()=>{} }); assert.equal(calls,1);
  calls=0; await amazonFetch('https://amazon.test', {}, { fetchImpl:async () => { calls++;return new Response('',{status:503}); }, sleep:async()=>{} });assert.equal(calls,4);
  assert(retryDelay(new Response('',{status:429}),0)>=60000);
});

test('streaming payload limits cannot be bypassed by missing content-length', async () => {
  const payload = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); controller.close(); } }));
  await assert.rejects(() => boundedBytes(payload, 10), /size limit/);
  await assert.rejects(() => boundedBytes(new Response('x', { headers: { 'content-length': '20' } }), 10), /size limit/);
  assert.equal((await boundedBytes(new Response('safe'), 10)).length, 4);
});
