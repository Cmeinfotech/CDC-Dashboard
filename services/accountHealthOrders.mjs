export function accountHealthOrders(report, startDate = '', endDate = '', channel = '') {
  const rows = (report?.rows || []).filter(row => {
    const date = String(row['purchase-date'] || '').slice(0, 10);
    return date && (!startDate || date >= startDate) && (!endDate || date <= endDate) && row['sales-channel'] === 'Amazon.com' && (channel !== 'fbm' || /^(merchant|mfn|fbm)$/i.test(row['fulfillment-channel'] || ''));
  });
  return {
    available: Boolean(report), source: 'Amazon SP-API Orders Report', capturedAt: report?.pulledAt || null,
    total: rows.length, truncated: false,
    orderCoverage: { startDate: report?.coverageStart || report?.start || null, endDate: report?.coverageEnd || report?.end || null },
    orderRecords: rows.map(row => ({
      orderId: row['amazon-order-id'] || '', orderDate: String(row['purchase-date'] || '').slice(0, 10),
      sku: row.sku || '', title: row['product-name'] || '', fulfillmentChannel: row['fulfillment-channel'] || '',
      status: row['order-status'] || '', shipServiceLevel: row['ship-service-level'] || '', shipState: row['ship-state'] || '',
      latestShipDate: row['latest-ship-date'] || '', earliestDeliveryDate: row['earliest-delivery-date'] || '', latestDeliveryDate: row['latest-delivery-date'] || '',
    })),
  };
}
