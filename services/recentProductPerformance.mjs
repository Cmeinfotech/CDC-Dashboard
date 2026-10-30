export function recentProductPerformance(report, products, today, lowOrderThreshold = 5) {
  const startDate = new Date(`${today}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  const start = startDate.toISOString().slice(0, 10);
  const previousStartDate = new Date(`${start}T00:00:00Z`);
  previousStartDate.setUTCDate(previousStartDate.getUTCDate() - 30);
  const previousStart = previousStartDate.toISOString().slice(0, 10);
  const previousEndDate = new Date(`${start}T00:00:00Z`);
  previousEndDate.setUTCDate(previousEndDate.getUTCDate() - 1);
  const coverageStart = String(report?.coverageStart || report?.start || '').slice(0, 10);
  const coverageEnd = String(report?.coverageEnd || report?.end || '').slice(0, 10);
  const age = Date.now() - Date.parse(report?.pulledAt || '');
  const fresh = age >= 0 && age <= 60 * 60_000;
  const completeCoverage = Boolean(Array.isArray(report?.rows) && coverageStart && coverageStart <= start && coverageEnd >= today && fresh);
  const growthCoverage = Boolean(Array.isArray(report?.rows) && coverageStart && coverageStart <= previousStart && coverageEnd >= today && fresh);
  const sources = new Map(products.map(product => [JSON.stringify([product.sku, product.asin]), product]));
  const groups = new Map();
  const seenItems = new Set();
  for (const row of report?.rows || []) {
    if (row['sales-channel'] !== 'Amazon.com' || /cancel/i.test(`${row['order-status']} ${row['item-status']}`)) continue;
    const date = String(row['purchase-date'] || '').slice(0, 10);
    const quantity = Number(row.quantity ?? row['quantity-purchased']);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || !row.sku || !row.asin || !Number.isFinite(quantity) || quantity <= 0) continue;
    const itemId = row['order-item-id'];
    if (itemId && seenItems.has(itemId)) continue;
    if (itemId) seenItems.add(itemId);
    const source = sources.get(JSON.stringify([row.sku, row.asin]));
    for (const asin of new Set([row.asin, ...(source?.parentAsins || [])])) {
      const group = groups.get(asin) || { orders: new Set(), previousOrders: new Set(), units: 0, salesByCurrency: {}, previousSalesByCurrency: {}, salesComplete: true, previousSalesComplete: true, ordersComplete: true, previousOrdersComplete: true, lastSaleDate: null };
      if (!group.lastSaleDate || date > group.lastSaleDate) group.lastSaleDate = date;
      if (date >= previousStart && date < start) {
        const orderId = String(row['amazon-order-id'] || '').trim();
        if (orderId) group.previousOrders.add(orderId); else group.previousOrdersComplete = false;
        const amount = row['item-price'];
        if (amount != null && String(amount).trim() && Number.isFinite(Number(amount)) && row.currency) group.previousSalesByCurrency[row.currency] = (group.previousSalesByCurrency[row.currency] || 0) + Number(amount);
        else group.previousSalesComplete = false;
      } else if (date >= start) {
        const orderId = String(row['amazon-order-id'] || '').trim();
        if (orderId) group.orders.add(orderId); else group.ordersComplete = false;
        group.units += quantity;
        const amount = row['item-price'];
        if (amount != null && String(amount).trim() && Number.isFinite(Number(amount)) && row.currency) group.salesByCurrency[row.currency] = (group.salesByCurrency[row.currency] || 0) + Number(amount);
        else group.salesComplete = false;
      }
      groups.set(asin, group);
    }
  }
  return { start, end: today, previousStart, previousEnd: previousEndDate.toISOString().slice(0, 10), completeCoverage, growthCoverage, lowOrderThreshold, byAsin: Object.fromEntries([...groups].map(([asin, group]) => [asin, { orders: group.ordersComplete ? group.orders.size : null, units: group.units, salesByCurrency: group.salesComplete ? group.salesByCurrency : null, previousOrders: growthCoverage && group.previousOrdersComplete ? group.previousOrders.size : null, previousSalesByCurrency: growthCoverage && group.previousSalesComplete ? group.previousSalesByCurrency : null, lastSaleDate: group.lastSaleDate }])) };
}
