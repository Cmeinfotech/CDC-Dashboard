import test from 'node:test';
import assert from 'node:assert/strict';
import { liveSalesProfit } from '../services/liveSalesProfit.mjs';
const row = (id, overrides = {}) => ({ 'amazon-order-id': id, 'purchase-date': '2026-11-01T12:00:00Z', 'order-status': 'Shipped', 'sales-channel': 'Amazon.com', currency: 'USD', quantity: '1', asin: 'A', sku: 'S', 'item-price': '20', 'shipping-price': '2', 'item-tax': '1', 'shipping-tax': '0', 'item-promotion-discount': '1', 'ship-promotion-discount': '0', ...overrides });
const report = rows => ({ coverageStart: '2026-09-01', coverageEnd: '2026-11-18', rows });
const params = () => new URLSearchParams({ startDate: '2026-11-01', endDate: '2026-11-10' });
const metric = (data, label) => data.metrics.find(item => item.label === label).current;
test('metric logic counts order records and preserves USD sales scope', () => {
  const data = liveSalesProfit(report([row('1'), row('1'), row('2', { 'order-status': 'Cancelled' }), row('3', { currency: 'CAD' })]), null, null, params());
  assert.equal(metric(data, 'Total Orders'), 4); assert.equal(metric(data, 'Actual Orders'), 'Unavailable'); assert.equal(metric(data, 'Cancelled Orders'), 1);
  assert.equal(metric(data, 'Revenue After Promotions (USD)'), 42); assert.equal(metric(data, 'Units Sold'), 3);
  assert.equal(data.tables['Total Orders'].rows.length, 4); assert.equal(metric(data, 'Total Profit'), 'Unavailable');
});
test('missing monetary fields are unavailable instead of zero', () => {
  const data = liveSalesProfit(report([row('1', { 'item-price': '' })]), null, null, params());
  assert.equal(metric(data, 'Revenue After Promotions (USD)'), 'Unavailable');
});
test('incomplete coverage never displays a misleading zero or full-period result', () => {
  const data = liveSalesProfit({ ...report([row('1')]), coverageStart: '2026-11-05' }, null, null, params());
  assert.equal(metric(data, 'Total Orders'), 'Unavailable'); assert.match(data.notes[0], /incomplete/);
});
test('financial breakdown uses leaf amounts, preserving currency and avoiding parent double counts', () => {
  const event = { transactionId: 't1', postedDate: '2026-11-01', transactionType: 'Refund', totalAmount: { currencyCode: 'USD', currencyAmount: -10 }, breakdowns: [{ breakdownType: 'Fees', breakdownAmount: { currencyAmount: -3, currencyCode: 'USD' }, breakdowns: [{ breakdownType: 'Commission', breakdownAmount: { currencyAmount: -3, currencyCode: 'USD' } }] }] };
  const data = liveSalesProfit(report([]), { start: '2026-09-01', end: '2026-11-18', transactions: [event] }, null, params());
  assert.equal(data.tables['Refund Transactions'].rows.length, 1); assert.equal(data.tables['Financial Breakdown'].rows.length, 1); assert.equal(data.tables['Financial Breakdown'].rows[0][6], -3);
});
test('refresh replaces changed order statuses and retains separate identical item lines', async () => {
  const { mergeOrderReportRows } = await import('../services/mergeOrderReportRows.mjs');
  const old = row('1', { 'item-status': 'Unshipped' });
  const fresh = row('1', { 'item-status': 'Shipped' });
  const outside = row('2', { 'purchase-date': '2026-10-01' });
  const merged = mergeOrderReportRows([old, outside], [fresh, fresh], { start: '2026-11-01T00:00:00Z', end: '2026-11-02T00:00:00Z' });
  assert.equal(merged.length, 3); assert.equal(merged.filter(item => item['item-status'] === 'Unshipped').length, 0);
  assert.equal(merged.filter(item => item['amazon-order-id'] === '1').length, 2);
});
test('blank optional charge columns in Amazon reports contribute no charge', () => {
  const data = liveSalesProfit(report([row('1', { 'shipping-price': '', 'shipping-tax': '', 'item-tax': '', 'item-promotion-discount': '', 'ship-promotion-discount': '' })]), null, null, params());
  assert.equal(metric(data, 'Revenue After Promotions (USD)'), 20);
  assert.equal(metric(data, 'Taxes Collected'), 0);
});
test('supplied handling and provisional formulas reconcile without claiming complete actual profit', () => {
  const data = liveSalesProfit(report([row('1', { quantity: 3, 'item-price': 100, 'shipping-price': 5, 'item-promotion-discount': 2, 'ship-promotion-discount': 1, 'item-tax': 4, 'shipping-tax': 1, 'gift-wrap-tax': 0.5 })]), null, null, params());
  assert.equal(metric(data, 'Revenue After Promotions (USD)'), 102);
  assert.equal(metric(data, 'Taxes Collected'), 5.5);
  assert.equal(metric(data, 'Handling Charges'), 6);
  assert.equal(metric(data, 'Included Estimated Cost'), 6);
  assert.equal(metric(data, 'Provisional Profit'), 96);
  const product = data.tables.Product_Performance;
  assert.equal(product.rows[0][product.columns.indexOf('Provisional Profit (USD)')], 96);
  assert.equal(product.rows[0][product.columns.indexOf('Product Cost')], null);
  assert.equal(metric(data, 'Provisional Profit Margin'), 96 / 102);
  assert.equal(metric(data, 'Total Cost'), 'Unavailable');
  assert.equal(metric(data, 'Total Profit'), 'Unavailable');
  assert.equal(metric(data, 'Actual Orders'), 'Unavailable');
  assert.equal(metric(data, 'Orders Before Refunds'), 1);
  assert.equal(metric(data, 'Units per Order'), 'Unavailable');
  assert.equal(metric(data, 'Units per Order (Before Refunds)'), 3);
});
test('listing stock formulas distinguish known zero stock from unknown quantities', () => {
  const products = [{ listing: { status: 'Active', quantity: 4 } }, { listing: { status: ['Active'], quantity: 0 } }, { listing: { status: 'Inactive', quantity: 10 } }];
  const data = liveSalesProfit(report([]), null, { products }, params());
  assert.equal(metric(data, 'Active Listings'), 2); assert.equal(metric(data, 'Inactive Listings'), 1);
  assert.equal(metric(data, 'Active & In-Stock Listings'), 1); assert.equal(metric(data, 'Active & Out-of-Stock Listings'), 1);
  assert.equal(metric(data, 'In-Stock % of Active'), 0.5);
  products.push({ listing: { status: 'Active', quantity: '' } });
  assert.equal(metric(liveSalesProfit(report([]), null, { products }, params()), 'In-Stock % of Active'), 'Unavailable');
});
test('dashboard summary skips all large detail tables and preserves calculated metrics',()=>{
 const p=params();p.set('_summary','1');
 const input=report([row('1'),row('2')]);
 const summary=liveSalesProfit(input,null,null,p);
 const full=liveSalesProfit(input,null,null,params());
 assert.deepEqual(summary.metrics,full.metrics);
 assert.equal(summary.tables['Total Orders'],undefined);
 assert.equal(summary.tables['Financial Breakdown'],undefined);
 assert.equal(summary.tables['Daily Product Sales'],undefined);
});
test('reading one detail sheet never builds unrelated finance detail arrays', async()=>{
 const {salesProfitView}=await import('../services/salesProfit.mjs');
 const d=liveSalesProfit(report([row('1')]),null,null,params());
 let accessed=false;
 Object.defineProperty(d.tables,'Financial Breakdown',{enumerable:true,configurable:true,get(){accessed=true;throw Error('Unrelated finance table evaluated');}});
 assert.equal(salesProfitView(d,new URLSearchParams({sheet:'Total Orders'})).total,1);
 assert.equal(accessed,false);
 salesProfitView(d,new URLSearchParams());assert.equal(accessed,false);
});
