const day = value => String(value || '').slice(0, 10);
const cancelled = row => /cancel/i.test(row['order-status'] || '');
// Match purchase-period records to refunds observed through the latest complete pull.
// Never subtract posted-period refund totals or other purchase cohorts from this count.
export function matchRefundedOrderRecords(rows, finance, startDate, endDate) {
  const unavailable = reason => ({ available: false, reason, refundedRows: [], actualRows: [], matchedRows: [] });
  const refunds = Array.isArray(finance?.rawEvents) ? finance.rawEvents : Array.isArray(finance?.transactions) ? finance.transactions.filter(event => /refund/i.test(event.transactionType || '')).map(event => ({ type: 'RefundEventList', event: {
    AmazonOrderId: event.relatedIdentifiers?.find(item => item.relatedIdentifierName === 'ORDER_ID')?.relatedIdentifierValue,
    MarketplaceName: event.sellingPartnerMetadata?.marketplaceId && event.sellingPartnerMetadata.marketplaceId !== finance.marketplaceId ? 'Other marketplace' : null,
    ShipmentItemAdjustmentList: (event.items || []).map(item => ({ SellerSKU: item.contexts?.find(context => context.sku)?.sku || item.sellerSku })),
  } })) : null;
  if (!refunds) return unavailable('Complete refund item records have not been pulled.');
  if (!day(finance.start) || !day(finance.end) || day(finance.start) > startDate || day(finance.end) < endDate) return unavailable('Refund coverage does not cover the purchase period.');
  const eligible = rows.filter(row => row['amazon-order-id'] && !cancelled(row));
  const byKey = new Map(), byOrder = new Map();
  for (const row of eligible) {
    const key = JSON.stringify([row['amazon-order-id'], row.sku]);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
    if (!byOrder.has(row['amazon-order-id'])) byOrder.set(row['amazon-order-id'], []);
    byOrder.get(row['amazon-order-id']).push(row);
  }
  const matched = new Set();
  let ambiguous = 0;
  const uncertainRows = new Set();
  let unresolvedIdentity = false;
  for (const { type, event } of refunds) {
    if (type !== 'RefundEventList' || event.MarketplaceName && event.MarketplaceName !== 'Amazon.com') continue;
    if (!event.AmazonOrderId) { if (eligible.length) { ambiguous++; unresolvedIdentity = true; } continue; }
    if (!byOrder.has(event.AmazonOrderId)) continue;
    const items = event.ShipmentItemAdjustmentList || [];
    if (!items.length) { ambiguous++; unresolvedIdentity = true; continue; }
    for (const item of items) {
      // Zero-quantity rows cannot be the returned item; keep them in the source COUNT baseline.
      const candidates = (item.SellerSKU ? byKey.get(JSON.stringify([event.AmazonOrderId, item.SellerSKU])) || [] : byOrder.get(event.AmazonOrderId)).filter(row => Number(row.quantity ?? row['quantity-purchased']) > 0);
      // A cancelled-only item refund does not affect the remaining non-cancelled records.
      if (item.SellerSKU && !candidates.length && rows.some(row => row['amazon-order-id'] === event.AmazonOrderId && row.sku === item.SellerSKU && cancelled(row))) continue;
      if (candidates.length === 1) matched.add(candidates[0]);
      else { ambiguous++; if (!candidates.length) unresolvedIdentity = true; candidates.forEach(row => uncertainRows.add(row)); }
    }
  }
  const matchedRows = eligible.filter(row => matched.has(row));
  if (ambiguous) return { ...unavailable(`${ambiguous} refund items cannot be matched unambiguously to source order records.`), matchedRows, bounds: unresolvedIdentity ? null : { refundMin: matchedRows.length, refundMax: new Set([...matched, ...uncertainRows]).size, actualMin: eligible.length - new Set([...matched, ...uncertainRows]).size, actualMax: eligible.length - matchedRows.length } };
  return { available: true, reason: '', refundedRows: matchedRows, matchedRows, actualRows: eligible.filter(row => !matched.has(row)), asOf: finance.pulledAt || finance.end };
}
