import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { recentProductPerformance } from '../services/recentProductPerformance.mjs';

const compiled = ts.transpileModule(fs.readFileSync(new URL('../utils/productPerformance.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { productPerformanceDetails, matchesPerformanceFilter } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const sources = [
  { sku: 'P', asin: 'PARENT0001', parentage: 'Parent', status: 'Incomplete' },
  { sku: 'A', asin: 'CHILD00001', parentAsins: ['PARENT0001'], parentage: 'Child', status: 'Active', fulfillment: 'AMAZON_NA', fbaStock: { sellable: 0 } },
  { sku: 'B', asin: 'CHILD00002', parentAsins: ['PARENT0001'], parentage: 'Child', status: 'Active' },
];
const order = (overrides = {}) => ({ 'sales-channel': 'Amazon.com', 'amazon-order-id': 'ORDER1', 'order-item-id': 'ITEM1', 'purchase-date': '2026-10-20', 'order-status': 'Shipped', sku: 'A', asin: 'CHILD00001', quantity: 1, 'item-price': 10, currency: 'USD', ...overrides });
const report = rows => ({ rows, coverageStart: '2026-01-01', coverageEnd: '2026-10-30', pulledAt: new Date().toISOString() });
const details = (period, products = sources) => productPerformanceDetails('PARENT0001', ['CHILD00001', 'CHILD00002'], { products, performance30Days: period });

test('30-day parent metrics count a shared order once across child listings', () => {
  const a = order();
  const b = order({ 'order-item-id': 'ITEM2', sku: 'B', asin: 'CHILD00002', quantity: 2, 'item-price': 20 });
  const result = recentProductPerformance(report([a, a, b, order({ 'order-item-id': 'CANCEL', 'order-status': 'Cancelled' })]), sources, '2026-10-30');
  assert.equal(result.start, '2026-10-01');
  assert.equal(result.completeCoverage, true);
  assert.equal(result.byAsin.PARENT0001.orders, 1);
  assert.equal(result.byAsin.PARENT0001.units, 3);
  assert.deepEqual(result.byAsin.PARENT0001.salesByCurrency, { USD: 30 });
});

test('window boundaries, marketplace and currency are respected', () => {
  const result = recentProductPerformance(report([
    order({ 'purchase-date': '2026-09-30', 'order-item-id': 'OLD' }),
    order({ 'purchase-date': '2026-10-01', 'order-item-id': 'FIRST' }),
    order({ 'purchase-date': '2026-10-30', 'order-item-id': 'EUR', 'amazon-order-id': 'ORDER2', currency: 'EUR', 'item-price': 20 }),
    order({ 'purchase-date': '2026-10-31', 'order-item-id': 'FUTURE' }),
    order({ 'sales-channel': 'Amazon.ca', 'order-item-id': 'OTHER' }),
  ]), sources, '2026-10-30');
  assert.equal(result.byAsin.PARENT0001.orders, 2);
  assert.deepEqual(result.byAsin.PARENT0001.salesByCurrency, { USD: 10, EUR: 20 });
  assert.equal(result.byAsin.PARENT0001.lastSaleDate, '2026-10-30');
});

test('zero sales and low orders are based on complete 30-day coverage', () => {
  assert(details(recentProductPerformance(report([]), sources, '2026-10-30')).attentionReasons.includes('No sales in 30 days'));
  assert(details(recentProductPerformance(report([order()]), sources, '2026-10-30')).attentionReasons.includes('Low orders (1 in 30 days)'));
  const partial = recentProductPerformance({ ...report([]), coverageStart: '2026-10-15' }, sources, '2026-10-30');
  assert.equal(details(partial).recent30DayOrders, null);
  assert.deepEqual(details(partial).attentionReasons, []);
  const stale = recentProductPerformance({ ...report([]), pulledAt: new Date(Date.now() - 2 * 3600_000).toISOString() }, sources, '2026-10-30');
  assert.equal(stale.completeCoverage, false);
});

test('parent placeholders and stock-only issues do not inflate low performance', () => {
  const rows = Array.from({ length: 8 }, (_, index) => order({ 'order-item-id': `ITEM${index}`, 'amazon-order-id': `ORDER${index}` }));
  const result = details(recentProductPerformance(report(rows), sources, '2026-10-30'));
  assert.deepEqual(result.attentionReasons, []);
  assert(result.stockReasons.includes('Out of stock'));
  assert.equal(matchesPerformanceFilter({ ...result, sales: 80, growth: 10 }, 'attention'), false);
  assert.equal(matchesPerformanceFilter({ ...result, sales: 80, growth: 10 }, 'stock'), true);
  assert.equal(result.listingStatus, 'Active (2)');
});

test('incomplete child listings remain actionable without sales history', () => {
  const result = details(undefined, sources.map(item => item.sku === 'A' ? { ...item, status: 'Incomplete' } : item));
  assert(result.attentionReasons.includes('Inactive / incomplete listing'));
  assert.equal(result.focusAction, 'Fix listing');
  assert.equal(result.recent30DayOrders, null);
});

test('missing order IDs or prices are shown as unknown, never invented zero', () => {
  const result = details(recentProductPerformance(report([order({ 'amazon-order-id': '', 'item-price': '' })]), sources, '2026-10-30'));
  assert.equal(result.recent30DayOrders, null);
  assert.equal(result.recent30DaySales, null);
  assert.deepEqual(result.attentionReasons, []);
});
