// Each downloaded report is authoritative for its purchase-date interval.
// Replace that interval so status/quantity changes do not leave stale order-item copies.
export function mergeOrderReportRows(existing, incoming, range) {
  const start = Date.parse(range.start), end = Date.parse(range.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw Error('Invalid report replacement interval.');
  return [...existing.filter(row => { const purchase = Date.parse(row['purchase-date']); return !Number.isFinite(purchase) || purchase < start || purchase > end; }), ...incoming];
}
