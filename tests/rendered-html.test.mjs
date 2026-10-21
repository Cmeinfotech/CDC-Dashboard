import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../dist/server/index.js';
import { authEnv, testToken } from './security-fixture.mjs';
Object.assign(process.env, authEnv, { APP_ORIGIN: 'https://dashboard.test', SECURITY_DEPLOYMENT_VERIFIED: 'true' });
const render = (pathname, authorized = true) => worker(new Request(`https://dashboard.test${pathname}`, { headers: { accept: 'text/html', ...(authorized ? { cookie: `cdc_session=${testToken()}` } : {}) } }), { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });

test('production middleware blocks anonymous pages and every private API', async () => {
 for (const pathname of ['/', '/amazon/monitor', '/api/amazon/preview', '/api/amazon/tracking-catalog', '/api/amazon/product?asin=B000000001', '/api/amazon/status', '/api/amazon/monitor', '/api/dashboard', '/api/uploads', '/api/tracking']) {
  const response = await render(pathname, false); assert.equal(response.status, 401, pathname); assert.match(await response.text(), /MFA/);
 }
});
test('production dashboard renders CDC monitoring without starter placeholders', async () => {
 const response = await render('/'); assert.equal(response.status, 200); const html = await response.text();
 assert.match(html, /CDC Sales Analytics/); assert.match(html, /Pull Amazon now/); assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});
test('production monitor renders the real pull controls', async () => {
 const response = await render('/amazon/monitor'); assert.equal(response.status, 200); const html = await response.text();
 assert.match(html, /Amazon Change Monitor/); assert.match(html, /Refresh status/); assert.match(html, /Loading monitoring history/);
});


