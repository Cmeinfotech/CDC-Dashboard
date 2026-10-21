import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { authEnv, testToken } from './security-fixture.mjs';
import { authenticatedUser } from '../services/accessSecurity.mjs';
import { verifyAdminPassword } from '../services/adminSecurity.mjs';
import { commitRun, monitorState, reviewChange, reverseMerge } from '../services/amazonMonitorStore.mjs';
import { compareProducts } from '../services/amazonMonitorCore.mjs';

async function isolated(fn) {
  const original = { ...process.env };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-admin-test-'));
  process.env.AMAZON_MONITOR_DATA_DIR = root;
  process.env.AMAZON_DATA_KEY = 'ac'.repeat(32);
  try { await fn(root); } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('only configured main admin can confirm a password, with encrypted attempt limits', async () => isolated(async root => {
  Object.assign(process.env, authEnv, { NODE_ENV: 'test', AUTH_MAIN_ADMIN_USER_ID: 'someone-else' });
  const request = () => new Request('https://dashboard.test/api/amazon/monitor/reverse', { headers: { authorization: `Bearer ${testToken()}`, 'x-admin': 'true' } });
  assert.equal((await verifyAdminPassword(request(), 'correct-password')).status, 403);
  process.env.AUTH_MAIN_ADMIN_USER_ID = 'test-person';
  delete process.env.AUTH_MAIN_ADMIN_PASSWORD_HASH;
  assert.equal((await verifyAdminPassword(request(), 'correct-password')).status, 503);
  const salt = 'ab'.repeat(16);
  process.env.AUTH_MAIN_ADMIN_PASSWORD_HASH = `scrypt:${salt}:${scryptSync('correct-password', salt, 64).toString('hex')}`;
  assert.deepEqual(authenticatedUser(request()).accounts, ['cdc', 'nana-jewellers']);
  assert.equal((await verifyAdminPassword(request(), 'correct-password')).user.userId, 'test-person');
  for (let i = 0; i < 5; i++) assert.equal((await verifyAdminPassword(request(), 'wrong-password')).status, 403);
  assert.equal((await verifyAdminPassword(request(), 'correct-password')).status, 429);
  const text = await fs.readFile(path.join(root, 'admin-attempts.json'), 'utf8');
  assert(!text.includes('wrong-password') && !text.includes('correct-password'));
  assert.match(text, /cdc-amazon-aes256gcm-v1/);
}));

test('reverse restores only selected SKU, audits actor, preserves snapshots and rejects repeats/stale reversals', async () => isolated(async () => {
  const product = (sku, parent) => ({ sku, asin: `ASIN-${sku}`, title: sku, parentAsins: [parent], childAsins: [], listing: {}, detailsAvailable: true, attributes: {}, images: [] });
  const oldProducts = [product('ONE', 'A'), product('TWO', 'B')];
  const newProducts = [product('ONE', 'B'), product('TWO', 'B')];
  const base = { complete: true, marketplaceId: 'US' };
  const first = { ...base, id: 'one', capturedAt: '2026-10-20T01:00:00Z', products: oldProducts, changes: [], baseline: true };
  const next = { ...base, id: 'two', capturedAt: '2026-10-21T01:00:00Z', products: newProducts, changes: compareProducts(first, { ...base, products: newProducts }, { runId: 'two', previousRunId: 'one', detectedAt: '2026-10-21T01:00:00Z' }) };
  await commitRun(first); await commitRun(next);
  const id = next.changes[0].id;
  await reviewChange(id, 'Merged', 'operator');
  await reverseMerge(id, 'main-admin');
  let state = await monitorState();
  assert.deepEqual(state.dashboardRun.products[0].parentAsins, ['A']);
  assert.deepEqual(state.dashboardRun.products[1].parentAsins, ['B']);
  assert.deepEqual(state.run.products[0].parentAsins, ['B']);
  assert.equal(state.changes[0].status, 'Reversed');
  assert.deepEqual(state.changes[0].audit.map(e=>[e.action,e.actor]), [['Merged','operator'],['Reversed','main-admin']]);
  await assert.rejects(()=>reverseMerge(id, 'main-admin'), /cannot be reversed/);
  await reviewChange(id, 'Merged', 'operator');
  state = await monitorState();
  assert.deepEqual(state.dashboardRun.products[0].parentAsins, ['B']);
  assert.equal(state.changes[0].audit.length, 3);
  await commitRun({ ...next, id: 'three', capturedAt: '2026-10-21T02:00:00Z', products: [product('ONE','C'), product('TWO','B')], changes: [] });
  await assert.rejects(()=>reverseMerge(id,'main-admin'), /no longer active/);
  assert.deepEqual((await monitorState()).dashboardRun.products[0].parentAsins, ['C']);
}));
