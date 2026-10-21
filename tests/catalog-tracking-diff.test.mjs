import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogTrackingChanges } from '../services/catalogTrackingDiff.mjs';

const row = (sku, asin, name, price = '10') => ({ sku, asin, data: { 'item-name': name, price } });

test('automatic catalog comparisons detect ASIN, attribute, added and missing changes', () => {
  const oldRows = [row('A', 'B000000001', 'Ring'), row('B', 'B000000002', 'Chain'), row('C', 'B000000003', 'Pendant')];
  const newRows = [row('A', 'B000000004', 'Ring'), row('B', 'B000000002', 'Chain', '12'), row('D', 'B000000005', 'Bracelet')];
  const changes = catalogTrackingChanges(oldRows, newRows);
  assert.deepEqual(changes.map(change => change.kind), ['asin', 'attribute', 'added', 'missing']);
  assert.deepEqual([changes[0].previousAsin, changes[0].currentAsin, changes[0].status], ['B000000001', 'B000000004', 'Ready to merge']);
  assert.deepEqual(changes[1].details, [{ field: 'price', previous: '10', current: '12' }]);
  assert.equal(catalogTrackingChanges(newRows, newRows).length, 0);
  assert.equal(catalogTrackingChanges([], newRows).length, 0);
});

test('dashboard-only aliases do not create false attribute changes', () => {
  const oldRows = [{ ...row('A', 'B000000001', 'Ring'), data: { ...row('A', 'B000000001', 'Ring').data, 'Parent ASIN': 'B000000001', 'Parent/Child': 'Child' } }];
  const newRows = [{ ...oldRows[0], data: { ...oldRows[0].data, Title: 'Ring', Status: 'Active' } }];
  assert.deepEqual(catalogTrackingChanges(oldRows, newRows), []);
});
