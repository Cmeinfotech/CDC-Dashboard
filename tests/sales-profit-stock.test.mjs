import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSalesProfitStock } from '../services/salesProfitStock.mjs';
const catalog = { marketplaceId: 'US', capturedAt: '2026-11-18', products: [{ sku: 'FBA', asin: 'same', listing: { fulfillment: 'AMAZON_NA', quantity: '' } }, { sku: 'FBM', asin: 'same', listing: { fulfillment: 'DEFAULT', quantity: '7' } }] };
const inventory = quantity => ({ marketplaceId: 'US', pulledAt: '2026-11-18', payload: { inventorySummaries: [{ sellerSku: 'FBA', asin: 'same', fnSku: 'fn1', inventoryDetails: { fulfillableQuantity: quantity }, totalQuantity: 100 }] } });
test('stock uses fulfillable FBA quantity by SKU and preserves merchant stock', () => {
  const data = resolveSalesProfitStock(catalog, inventory(0));
  assert.equal(data.products[0].listing.quantity, 0); assert.equal(data.products[1].listing.quantity, 7);
  assert.equal(catalog.products[0].listing.quantity, '');
});
test('missing SKU stock is not inferred from ASIN or total inventory', () => {
  const source = inventory(20); source.payload.inventorySummaries[0].sellerSku = 'different';
  assert.equal(resolveSalesProfitStock(catalog, source).products[0].listing.quantity, null);
  assert.equal(resolveSalesProfitStock(catalog, inventory(undefined)).products[0].listing.quantity, null);
});
test('inventory from a different marketplace is not mixed into catalog counts', () => {
  const source = inventory(20); source.marketplaceId = 'CA';
  assert.equal(resolveSalesProfitStock(catalog, source).products[0].listing.quantity, null);
});
test('stock drill-down filters agree with in-stock and out-of-stock rows', async () => {
  const { matchesSalesProfitFilter } = await import('../services/salesProfitViewFilter.mjs');
  assert.equal(matchesSalesProfitFilter(['date','sku','asin','title','Active',0], 'Listing_Snapshots', 'stock-out'), true);
  assert.equal(matchesSalesProfitFilter(['date','sku','asin','title','Active',null], 'Listing_Snapshots', 'stock-out'), false);
  assert.equal(matchesSalesProfitFilter(['date','sku','asin','title','Inactive',3], 'Listing_Snapshots', 'stock-in'), false);
});
