// Sales are item-price totals from saved US order-report rows, grouped by SKU + ASIN + currency.
export function catalogSales(rows) {
  const result = new Map(); const seen = new Set();
  for (const row of rows || []) {
    if (row['sales-channel'] !== 'Amazon.com' || /cancel/i.test(`${row['order-status']} ${row['item-status']}`)) continue;
    const identity = row['order-item-id'];
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    const amount = row['item-price']; const quantity = row.quantity;
    if (amount == null || String(amount).trim() === '' || !Number.isFinite(Number(amount)) || !row.currency || !row.sku || !row.asin) continue;
    const key = JSON.stringify([row.sku, row.asin]);
    const currencies = result.get(key) || {};
    const total = currencies[row.currency] || { currency: row.currency, amount: 0, units: 0, months: {} };
    total.amount += Number(amount);
    total.units += quantity != null && String(quantity).trim() !== '' && Number.isFinite(Number(quantity)) ? Number(quantity) : 0;
    const month = String(row['purchase-date'] || '').slice(0,7);
    if (/^\d{4}-\d{2}$/.test(month)) total.months[month] = (total.months[month] || 0) + Number(amount);
    currencies[row.currency] = total; result.set(key, currencies);
  }
  return result;
}
export function catalogProducts(products, orders) {
  const sales = catalogSales(orders);
  const display = value => Array.isArray(value) ? value.map(v => v?.value ?? '').filter(Boolean).join(', ') : '';
  return products.map(p => ({ sku: p.sku, asin: p.asin, title: p.title, parentage: p.parentage, parentAsins: p.parentAsins, childAsins: p.childAsins,
    image: (p.images || []).find(i=>i.variant === 'MAIN')?.link || p.images?.[0]?.link || null, detailsAvailable: p.detailsAvailable, status: p.listing?.status || null, price: p.listing?.price ?? null, quantity: p.listing?.quantity ?? null,
    attributes: Object.fromEntries(['brand','color','size','metal_type','style','item_type_keyword'].map(key => [key, display(p.attributes?.[key])]).filter(([,v]) => v)),
    sales: Object.values(sales.get(JSON.stringify([p.sku,p.asin])) || {}) }));
}
