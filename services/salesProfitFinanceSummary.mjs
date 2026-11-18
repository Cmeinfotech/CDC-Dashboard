const date = value => String(value || '').slice(0, 10);
const numeric = value => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const sum = values => values.some(value => value == null) ? null : values.reduce((a,b) => a+b,0);
export function financePeriodSummary(finance, a, b, marketplaceId = finance?.marketplaceId) {
    if (!finance || date(finance.start) > a || date(finance.end) < b) return { fees: null, refunds: null };
    const selected = finance.transactions.filter(event => event.sellingPartnerMetadata?.marketplaceId === marketplaceId && date(event.postedDate) >= a && date(event.postedDate) <= b && /^released$|^deferred_released$|^posted \(legacy\)$/i.test(event.transactionStatus || ''));
    const fees = [];
    function walk(nodes, parent = '') {
      for (const node of nodes || []) {
        const path = `${parent}/${node.breakdownType}`;
        if (node.breakdowns?.length) walk(node.breakdowns, path);
        else if ((finance.rawEvents ? /FeeAmount(?:\s|$)/.test(path) : /fee|commission/i.test(path)) && node.breakdownAmount?.currencyCode === 'USD') fees.push(numeric(node.breakdownAmount.currencyAmount));
      }
    }
    for (const event of selected) walk(event.breakdowns);
    return { fees: sum(fees), refunds: sum(selected.filter(event => /refund/i.test(event.transactionType) && (event.refundAmount || event.totalAmount)?.currencyCode === 'USD').map(event => numeric((event.refundAmount || event.totalAmount).currencyAmount))) };
  }
