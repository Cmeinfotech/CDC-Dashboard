import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonical, compareProducts, productRecords } from '../services/amazonMonitorCore.mjs';
import { atomicJson, acquireLock, commitRun, monitorState, reviewChange, monitorRoot } from '../services/amazonMonitorStore.mjs';
// An ephemeral test-only key, never production credentials.
process.env.AMAZON_DATA_KEY = 'ab'.repeat(32);

const product = (patch = {}) => ({ sku: 'SKU-A', asin: 'ASIN-A', title: 'Product', listing: { title: 'Product', quantity: '1' }, detailsAvailable: true, attributes: { bullet_point: [{ value: 'First' }, { value: 'Second' }], metal_type: [{ value: 'Silver' }, { value: 'Gold' }] }, images: [{ variant: 'MAIN', link: 'https://example.test/a' }], parentAsins: ['PARENT-A'], childAsins: [], ...patch });
const run = products => ({ complete: true, marketplaceId: 'MARKET-A', products });
const compare = (before, after) => compareProducts(run(before), run(after), { runId: 'RUN-NEW', previousRunId: 'RUN-OLD', detectedAt: '2026-01-01T00:00:00Z' });
test('does not alert on object key or unordered attribute reordering', () => {
  const next = product(); next.attributes.metal_type.reverse(); assert.deepEqual(compare([product()], [next]), []);
  assert.deepEqual(canonical({ b: 1, a: 2 }), { a: 2, b: 1 });
});
test('retains meaningful bullet order and old/new values', () => {
  const next = product(); next.attributes.bullet_point.reverse(); const changes = compare([product()], [next]);
  assert.equal(changes.length, 1); assert.equal(changes[0].field, 'attributes.bullet_point'); assert.equal(changes[0].previous[0].value, 'First'); assert.equal(changes[0].current[0].value, 'Second');
});
test('detects same SKU ASIN replacement without calling new content edits to old ASIN', () => {
  const changes = compare([product()], [product({ asin: 'ASIN-B', attributes: {} })]); assert.equal(changes.length, 1); assert.equal(changes[0].kind, 'asin'); assert.equal(changes[0].priority, 'High');
});
test('family changes are high priority and additions/removals are explicit', () => {
  assert.equal(compare([product()], [product({ parentAsins: ['PARENT-B'] })])[0].kind, 'family');
  assert.equal(compare([product()], [])[0].kind, 'missing'); assert.equal(compare([], [product()])[0].kind, 'added');
});
test('partial runs and cross-marketplace comparisons cannot delete products', () => {
  assert.throws(() => compareProducts(run([product()]), { ...run([]), complete: false }, {}), /complete/);
  assert.throws(() => compareProducts(run([product()]), { ...run([]), marketplaceId: 'OTHER' }, {}), /Marketplaces/);
});
test('unavailable details are coverage warnings, not hundreds of content deletions', () => {
  const changes = compare([product()], [product({ detailsAvailable: false, attributes: {}, images: [], parentAsins: [] })]); assert.equal(changes.length, 1); assert.equal(changes[0].kind, 'coverage');
  const omitted = product({ attributes: {} }); assert(compare([product()], [omitted]).every(change => change.availability.includes('not confirmed deletion')));
});
test('listing parsing preserves missing stock and ignores other marketplace attributes', () => {
  const listings = [{ 'seller-sku': 'SKU-A', asin1: 'ASIN-A', 'item-name': 'Title', quantity: '' }];
  const items = [{ asin: 'ASIN-A', attributes: { color: [{ marketplace_id: 'OTHER', value: 'red' }, { marketplace_id: 'MARKET-A', value: 'blue' }] }, relationships: [{ marketplaceId: 'OTHER', relationships: [{ parentAsins: ['WRONG'] }] }] }];
  const parsed = productRecords(listings, items, 'MARKET-A')[0]; assert.equal(parsed.listing.quantity, null); assert.equal(parsed.attributes.color.length, 1); assert.deepEqual(parsed.parentAsins, []); assert.equal(parsed.parentage, 'Unspecified');
  assert.throws(() => productRecords([...listings, ...listings], items, 'MARKET-A'), /Duplicate/);
});
test('durable history, review persistence, and locks survive reload without fake changes', async () => {
  const previousRoot = process.env.AMAZON_MONITOR_DATA_DIR; const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'cdc-monitor-test-')); process.env.AMAZON_MONITOR_DATA_DIR = temporary;
  try {
    const first = { ...run([product()]), id: 'first', capturedAt: '2026-01-01T00:00:00Z', source: 'test', baseline: true, changes: [] };
    await commitRun(first); assert.equal((await monitorState()).changes.length, 0);
    const second = { ...run([product({ parentAsins: ['PARENT-B'] })]), id: 'second', capturedAt: '2026-01-02T00:00:00Z', source: 'test', changes: compare(first.products, [product({ parentAsins: ['PARENT-B'] })]) };
    await commitRun(second); let state = await monitorState(); assert.equal(state.history.length, 2); assert.equal(state.changes.length, 1);
    const parentChange = state.changes[0];
    await reviewChange(parentChange.id, 'Merged');
    state = await monitorState();
    assert.equal(state.changes[0].status, 'Merged');
    assert.deepEqual(state.changes[0].activeMapping.previousParentAsins, ['PARENT-A']);
    assert.deepEqual(state.changes[0].activeMapping.currentParentAsins, ['PARENT-B']);
    assert.equal(state.dashboardRun.products[0].activeParentMapping.sku, 'SKU-A');
    assert.equal(state.run.products[0].activeParentMapping, undefined);
    const mergedAt = state.changes[0].activeMapping.mergedAt;
    await reviewChange(parentChange.id, 'Merged');
    assert.equal((await monitorState()).changes[0].activeMapping.mergedAt, mergedAt);
    await reviewChange(state.changes[0].id, 'Linked');
    const familyLinked = (await monitorState()).changes.find(c => c.id === state.changes[0].id);
    assert.equal(familyLinked.status, 'Linked'); assert.ok(familyLinked.linkedAt);
    await reviewChange(state.changes[0].id, 'Reviewed'); state = await monitorState(); assert.equal(state.changes[0].status, 'Reviewed');
    await reviewChange(state.changes[0].id, 'Unreviewed'); assert.equal((await monitorState()).changes[0].status, 'Unreviewed');
    const thirdProducts = [product({ asin: 'ASIN-B', parentAsins: ['PARENT-B'] })];
    await commitRun({ ...run(thirdProducts), id: 'third', capturedAt: '2026-01-03T00:00:00Z', changes: compare(second.products, thirdProducts) });
    await assert.rejects(() => reviewChange(parentChange.id, 'Merged'), /outdated/);
    assert.equal((await monitorState()).dashboardRun.products[0].activeParentMapping, undefined);
    const replacement = (await monitorState()).changes.find(c => c.kind === 'asin');
    await reviewChange(replacement.id, 'Linked');
    const linked = (await monitorState()).changes.find(c => c.id === replacement.id);
    assert.equal(linked.status, 'Linked'); assert.ok(linked.linkedAt);
    await assert.rejects(() => reviewChange('does-not-exist', 'Reviewed'), /does not exist/);
    const release = await acquireLock('sync'); await assert.rejects(() => acquireLock('sync'), /already running/); await release();
    await atomicJson(path.join(monitorRoot(), 'progress.json'), { status: 'failed', error: 'Permission denied' }); assert.equal((await monitorState()).run.id, 'third');
  } finally { if (previousRoot === undefined) delete process.env.AMAZON_MONITOR_DATA_DIR; else process.env.AMAZON_MONITOR_DATA_DIR = previousRoot; const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temporary)); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative)); await fs.rm(temporary, { recursive: true, force: true }); }
});

