export function matchesSalesProfitFilter(row, sheet, filter) {
  if (!filter) return true;
  if (sheet === 'Listing_Snapshots') {
    const active = String(row[4] || '').split(',').some(value => /^active$/i.test(value.trim()));
    const quantity = row[5] === '' || row[5] == null ? null : Number(row[5]);
    if (filter === 'stock-in') return active && quantity != null && quantity > 0;
    if (filter === 'stock-out') return active && quantity === 0;
    if (filter === 'active-listings') return active;
    if (filter === 'inactive-listings') return !active;
  }
  if (sheet === 'Total Orders') {
    if (filter === 'cancelled') return /cancel/i.test(String(row[2]));
    if (filter === 'actual') return !/cancel/i.test(String(row[2]));
    if (filter === 'fba') return /^(Amazon|AFN|FBA)$/i.test(String(row[3]));
    if (filter === 'fbm') return /^(Merchant|MFN|FBM)$/i.test(String(row[3]));
  }
  return true;
}
