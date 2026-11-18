const quantity = value => value === '' || value == null || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value);
// Catalog reports omit FBA quantity. Sellable FBA stock must come from Inventory API,
// joined by seller SKU (never ASIN: multiple SKUs can share one ASIN).
export function resolveSalesProfitStock(catalog, inventory) {
  if (!catalog) return null;
  const valid = inventory && (!catalog.marketplaceId || inventory.marketplaceId === catalog.marketplaceId);
  const bySku = new Map();
  const seen = new Set();
  for (const item of valid ? inventory.payload?.inventorySummaries || [] : []) {
    if (!item.sellerSku) continue;
    const key = JSON.stringify([item.sellerSku, item.fnSku, item.condition]);
    if (seen.has(key)) continue;
    seen.add(key);
    const available = quantity(item.inventoryDetails?.fulfillableQuantity);
    const existing = bySku.get(item.sellerSku);
    bySku.set(item.sellerSku, existing === undefined ? available : existing == null || available == null ? null : existing + available);
  }
  return { ...catalog, inventoryPulledAt: valid ? inventory.pulledAt : null, products: catalog.products.map(product => {
    const fba = /^(AMAZON.*|AFN|FBA)$/i.test(product.listing?.fulfillment || '');
    const value = fba && bySku.has(product.sku) ? bySku.get(product.sku) : quantity(product.listing?.quantity);
    return { ...product, stockSource: fba && bySku.has(product.sku) ? 'Amazon FBA Inventory · fulfillable quantity' : 'Amazon listing quantity', stockCapturedAt: fba && bySku.has(product.sku) ? inventory.pulledAt : catalog.capturedAt, listing: { ...product.listing, quantity: value } };
  }) };
}
