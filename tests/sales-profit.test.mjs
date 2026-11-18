import test from 'node:test';
import assert from 'node:assert/strict';
import { salesProfitView } from '../services/salesProfit.mjs';
const data = { metrics: [], tables: { 'Total Orders': { columns: ['ID', 'Date', 'Status'], rows: Array.from({ length: 105 }, (_, i) => [`order-${i}`, '2026-10-01', i % 2 ? 'Cancelled' : 'Shipped']) } } };
test('sales profit details paginate without dropping records', () => {
  const result = salesProfitView(data, new URLSearchParams({ sheet: 'Total Orders', page: '3' }));
  assert.equal(result.total, 105); assert.equal(result.rows.length, 5); assert.equal(result.pages, 3);
});
test('sales profit filters cancelled orders and searches all columns', () => {
  const result = salesProfitView(data, new URLSearchParams({ sheet: 'Total Orders', filter: 'cancelled', search: 'order-1' }));
  assert.equal(result.total, 8); assert.ok(result.rows.every(row => row[2] === 'Cancelled'));
});
test('unknown sheets are rejected and invalid pages are clamped', () => {
  assert.equal(salesProfitView(data, new URLSearchParams({ sheet: '__proto__' })), null);
  assert.equal(salesProfitView(data, new URLSearchParams({ sheet: 'Total Orders', page: '-2' })).page, 1);
});
