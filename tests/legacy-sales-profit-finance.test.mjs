import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLegacyFinance, pullLegacyFinance } from '../services/legacySalesProfitFinance.mjs';
import { liveSalesProfit } from '../services/liveSalesProfit.mjs';
test('legacy normalization preserves real component amounts without inventing net totals', () => {
  const event = { MarketplaceName: 'Amazon.com', PostedDate: '2026-11-01', AmazonOrderId: 'order1', ShipmentItemAdjustmentList: [{ ItemChargeAdjustmentList: [{ ChargeType: 'Principal', ChargeAmount: { CurrencyAmount: -20, CurrencyCode: 'USD' } }], ItemFeeAdjustmentList: [{ FeeType: 'Commission', FeeAmount: { CurrencyAmount: 3, CurrencyCode: 'USD' } }] }] };
  const normalized = normalizeLegacyFinance('RefundEventList', event, 'refund1', 'US');
  assert.equal(normalized.totalAmount, null); assert.equal(normalized.refundAmount.currencyAmount, -20);
  const finance = { marketplaceId: 'US', start: '2026-09-01', end: '2026-11-18', transactions: [normalized], rawEvents: [{ type: 'RefundEventList', event }] };
  const data = liveSalesProfit({ marketplaceId: 'US', rows: [], coverageStart: '2026-01-01', coverageEnd: '2026-11-18' }, finance, null, new URLSearchParams({ startDate: '2026-11-01', endDate: '2026-11-10' }));
  assert.equal(data.metrics.find(m => m.label === 'Refunds (Posted USD)').current, -20);
  assert.equal(data.metrics.find(m => m.label === 'Amazon Fees (Posted USD)').current, 3);
});
test('legacy pagination continues after an empty page and retains identical separate events', async () => {
  const calls = [];
  const event = { PostedDate: '2026-11-01', MarketplaceName: 'Amazon.com' };
  const result = await pullLegacyFinance({ api: async path => { calls.push(path); return calls.length === 1 ? { data: { payload: { FinancialEvents: {}, NextToken: 'next' } } } : { data: { payload: { FinancialEvents: { ShipmentEventList: [event, event] } } } }; }, start: new Date('2026-11-01'), end: new Date('2026-11-02'), marketplaceId: 'US', onProgress: async () => {}, sleep: async () => {} });
  assert.equal(result.pages, 2); assert.equal(result.transactions.length, 2); assert.notEqual(result.transactions[0].transactionId, result.transactions[1].transactionId);
  assert.match(calls[1], /NextToken=next/);
});
test('unassigned account-level events are retained without inventing marketplace or posted date', () => {
  const event = normalizeLegacyFinance('ServiceFeeEventList', { FeeList: [] }, 'account1', 'US');
  assert.equal(event.postedDate, null); assert.equal(event.sellingPartnerMetadata.marketplaceId, null);
});
