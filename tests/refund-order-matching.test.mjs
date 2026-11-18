import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRefundedOrderRecords } from '../services/refundOrderMatching.mjs';
const row = (id, sku = 'SKU', quantity = 1) => ({ 'amazon-order-id': id, sku, quantity, 'order-status': 'Shipped' });
const event = (id, sku = 'SKU') => ({ type: 'RefundEventList', event: { AmazonOrderId: id, MarketplaceName: 'Amazon.com', ShipmentItemAdjustmentList: [{ SellerSKU: sku }] } });
const finance = rawEvents => ({ start: '2026-09-01', end: '2026-11-18', pulledAt: '2026-11-18', rawEvents });
const match = (rows, source) => matchRefundedOrderRecords(rows, source, '2026-10-20', '2026-11-18');
test('refund matching excludes a source record once and ignores other purchase cohorts', () => {
  const result = match([row('1'), row('2')], finance([event('1'), event('1'), event('old-order')]));
  assert.equal(result.available, true); assert.equal(result.refundedRows.length, 1); assert.equal(result.actualRows.length, 1);
});
test('a zero-quantity source row is not selected as a returned item', () => {
  const rows = [row('1', 'SKU', 0), row('1', 'SKU', 9)];
  const result = match(rows, finance([event('1')]));
  assert.equal(result.available, true); assert.equal(result.refundedRows[0], rows[1]);
});
test('ambiguous positive lines stay unavailable rather than guessing a match', () => {
  assert.equal(match([row('1'), row('1')], finance([event('1')])).available, false);
});
test('missing coverage is not interpreted as zero refunds', () => {
  assert.equal(match([row('1')], null).available, false);
  assert.equal(match([row('1')], { ...finance([]), start: '2026-11-01' }).available, false);
  assert.equal(match([row('1')], finance([])).refundedRows.length, 0);
});
test('modern refund transaction product contexts can also match source SKU records', () => {
  const modern = { marketplaceId: 'US', start: '2026-09-01', end: '2026-11-18', transactions: [{ transactionType: 'Refund', sellingPartnerMetadata: { marketplaceId: 'US' }, relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: '1' }], items: [{ contexts: [{ contextType: 'ProductContext', sku: 'SKU' }] }] }] };
  const result = match([row('1')], modern);
  assert.equal(result.available, true); assert.equal(result.refundedRows.length, 1);
});
test('ambiguous refund matches return conservative bounds instead of an invented exact count',()=>{
 const result=match([row('1'),row('1'),row('2')],finance([event('1'),event('2')]));
 assert.deepEqual(result.bounds,{refundMin:1,refundMax:3,actualMin:0,actualMax:2});
});
