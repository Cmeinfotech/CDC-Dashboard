const value = input => input == null ? '' : typeof input === 'object' ? JSON.stringify(input) : String(input);
const title = row => value(row.data?.Title || row.data?.['item-name'] || row.data?.['Product Name']);
const parentSku = row => value(row.data?.['Parent SKU'] || row.data?.['parent-sku']);
const ignored = new Set(['Title', 'Parent SKU', 'Status']);

export function catalogTrackingChanges(previous, current) {
  if (!previous.length) return [];
  const oldBySku = new Map(previous.map(row => [row.sku, row]));
  const nextBySku = new Map(current.map(row => [row.sku, row]));
  const changes = [];
  for (const row of current) {
    const old = oldBySku.get(row.sku);
    if (!old) {
      changes.push({ kind: 'added', asin: row.asin, sku: row.sku, parentSku: parentSku(row), product: title(row), previousAsin: '', currentAsin: row.asin, details: [], status: 'Detected', confidence: 0 });
      continue;
    }
    if (old.asin !== row.asin) {
      changes.push({ kind: 'asin', asin: row.asin, sku: row.sku, parentSku: parentSku(row), product: title(row), previousAsin: old.asin, currentAsin: row.asin, details: [], status: 'Ready to merge', confidence: 100 });
      continue;
    }
    const fields = new Set([...Object.keys(old.data || {}), ...Object.keys(row.data || {})]);
    const details = [...fields].filter(field => !ignored.has(field) && value(old.data?.[field]) !== value(row.data?.[field]))
      .map(field => ({ field, previous: value(old.data?.[field]), current: value(row.data?.[field]) }));
    if (details.length) changes.push({ kind: 'attribute', asin: row.asin, sku: row.sku, parentSku: parentSku(row), product: title(row), previousAsin: old.asin, currentAsin: row.asin, details, status: 'Detected', confidence: 100 });
  }
  for (const row of previous) if (!nextBySku.has(row.sku)) changes.push({ kind: 'missing', asin: row.asin, sku: row.sku, parentSku: parentSku(row), product: title(row), previousAsin: row.asin, currentAsin: '', details: [], status: 'Detected', confidence: 0 });
  return changes;
}
