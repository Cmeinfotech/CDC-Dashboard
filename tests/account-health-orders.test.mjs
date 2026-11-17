import test from 'node:test';
import assert from 'node:assert/strict';
import { accountHealthOrders } from '../services/accountHealthOrders.mjs';

const report = { pulledAt: '2026-11-05T00:00:00Z', rows: [
  { 'amazon-order-id': 'merchant-order', 'purchase-date': '2026-11-04T09:00:00Z', 'sales-channel': 'Amazon.com', 'fulfillment-channel': 'Merchant', sku: 'sku-one', 'product-name': 'Product one', 'ship-state': 'CA', 'ship-service-level': 'Standard', 'order-status': 'Shipped' },
  { 'amazon-order-id': 'fba-order', 'purchase-date': '2026-11-04', 'sales-channel': 'Amazon.com', 'fulfillment-channel': 'Amazon' },
  { 'amazon-order-id': 'other-market', 'purchase-date': '2026-11-04', 'sales-channel': 'Amazon.ca', 'fulfillment-channel': 'Merchant' },
  { 'amazon-order-id': 'older-order', 'purchase-date': '2026-10-01', 'sales-channel': 'Amazon.com', 'fulfillment-channel': 'Merchant' },
] };
test('health order context filters by report dates, US market and FBM before returning rows', () => {
  const result = accountHealthOrders(report, '2026-11-01', '2026-11-05', 'fbm');
  assert.equal(result.total, 1);
  assert.equal(result.orderRecords[0].orderId, 'merchant-order');
  assert.equal(result.orderRecords[0].shipState, 'CA');
  assert.equal(result.orderRecords[0].sku, 'sku-one');
  assert.equal(result.orderRecords[0].latestShipDate, '');
  assert.equal(result.capturedAt, report.pulledAt);
});
test('claims context retains both channels and does not invent missing shipping dates', () => {
  const result = accountHealthOrders(report, '2026-11-04', '2026-11-04');
  assert.equal(result.total, 2);
  assert.ok(result.orderRecords.every(row => row.earliestDeliveryDate === '' && row.latestDeliveryDate === ''));
});
test('missing report is distinguishable from a complete report with no matching orders', () => {
  assert.equal(accountHealthOrders(null).available, false);
  const empty = accountHealthOrders(report, '2026-12-01', '2026-12-31');
  assert.equal(empty.available, true);
  assert.equal(empty.total, 0);
});
