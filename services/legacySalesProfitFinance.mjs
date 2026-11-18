import { createHash } from 'node:crypto';
// Legacy API has no universal transaction ID or net total. Retain component amounts
// and source provenance; do not invent a modern transaction total.
export function normalizeLegacyFinance(type, event, transactionId, marketplaceId, orderIds = new Set()) {
  const marketplace = event.MarketplaceName;
  const matched = marketplace ? marketplace === 'Amazon.com' : Boolean(event.AmazonOrderId && orderIds.has(event.AmazonOrderId));
  const breakdowns = [];
  function walk(value, path = '') {
    if (!value || typeof value !== 'object') return;
    if (typeof value.CurrencyAmount === 'number' && value.CurrencyCode) {
      breakdowns.push({ breakdownType: path, breakdownAmount: { currencyCode: value.CurrencyCode, currencyAmount: value.CurrencyAmount } });
      return;
    }
    if (Array.isArray(value)) { value.forEach((child, index) => walk(child, `${path}[${index}]`)); return; }
    const label = value.FeeType || value.ChargeType || value.PromotionType;
    for (const [key, child] of Object.entries(value)) walk(child, `${path}${path ? '/' : ''}${key}${label ? ` (${label})` : ''}`);
  }
  walk(event);
  const refund = /RefundEventList/.test(type);
  const refundComponents = breakdowns.filter(row => /ChargeAmount|PromotionAmount/.test(row.breakdownType) && !/Fee|TaxWithheld/.test(row.breakdownType));
  const currencies = [...new Set(refundComponents.map(row => row.breakdownAmount.currencyCode))];
  const refundAmount = refund && currencies.length === 1 ? { currencyCode: currencies[0], currencyAmount: refundComponents.reduce((sum, row) => sum + row.breakdownAmount.currencyAmount, 0) } : null;
  return { transactionId, transactionType: type.replace(/EventList$/, ''), transactionStatus: 'Posted (legacy)', postedDate: event.PostedDate || null, sellingPartnerMetadata: { marketplaceId: matched ? marketplaceId : null }, relatedIdentifiers: event.AmazonOrderId ? [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: event.AmazonOrderId }] : [], totalAmount: null, refundAmount, amountBasis: refund ? 'Customer charge and promotion adjustments; fees excluded' : 'No universal net total returned by legacy API; see breakdown', breakdowns, source: 'Amazon Finances v0', sourceScope: matched ? 'Amazon.com' : marketplace || 'Account-level / marketplace not returned' };
}
export async function pullLegacyFinance({ api, start, end, marketplaceId, orderIds, onProgress, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const transactions = [], rawEvents = [], occurrences = new Map();
  let pages = 0;
  for (let cursor = start.getTime(); cursor < end.getTime();) {
    const before = Math.min(cursor + 179 * 86400000, end.getTime());
    let nextToken;
    const seenTokens = new Set();
    do {
      const query = new URLSearchParams({ PostedAfter: new Date(cursor).toISOString(), PostedBefore: new Date(before).toISOString(), MaxResultsPerPage: '100' });
      if (nextToken) query.set('NextToken', nextToken);
      const response = await api(`/finances/v0/financialEvents?${query}`);
      const payload = response.data?.payload;
      if (!payload || !payload.FinancialEvents || typeof payload.FinancialEvents !== 'object') throw Error('Invalid legacy finance response.');
      for (const [type, events] of Object.entries(payload.FinancialEvents)) {
        if (!Array.isArray(events)) throw Error('Invalid financial event list.');
        for (const event of events) {
          const hash = createHash('sha256').update(JSON.stringify([type, event])).digest('hex');
          const occurrence = (occurrences.get(hash) || 0) + 1; occurrences.set(hash, occurrence);
          const transactionId = `v0-${hash}-${occurrence}`;
          rawEvents.push({ type, event });
          transactions.push(normalizeLegacyFinance(type, event, transactionId, marketplaceId, orderIds));
        }
      }
      nextToken = payload.NextToken;
      if (nextToken && seenTokens.has(nextToken)) throw Error('Amazon repeated a finance pagination token; incomplete pull was not saved.');
      if (nextToken) seenTokens.add(nextToken);
      pages++;
      await onProgress({ pages, rows: transactions.length, source: 'Amazon Finances v0' });
      if (nextToken) await sleep(2100);
    } while (nextToken);
    cursor = before;
    if (cursor < end.getTime()) await sleep(2100);
  }
  return { transactions, rawEvents, pages, source: 'Amazon Finances v0 (authorized fallback)', marketplaceId, start: start.toISOString(), end: end.toISOString() };
}
