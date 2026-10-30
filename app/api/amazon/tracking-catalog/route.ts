import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { accessGuard } from '../../../../services/accessSecurity.mjs';
import { monitorState } from '../../../../services/amazonMonitorStore.mjs';
import { readAmazonJson } from '../../../../services/amazonDataSecurity.mjs';
import { catalogProducts } from '../../../../services/amazonTrackingCatalog.mjs';
import { recentProductPerformance } from '../../../../services/recentProductPerformance.mjs';
export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get('x-cdc-account-id') === 'nana-jewellers') return Response.json({error:'CDC only.'}, {status:403});
  try {
    const folder = join(process.cwd(),'outputs','amazon-cdc');
    const optional = async (name: string) => { try { return await readAmazonJson(join(folder,name)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } };
    const [state, report, inventory] = await Promise.all([monitorState(), optional('order-report.json'), optional('inventory.json')]);
    const inventoryInfo = inventory ? await stat(join(folder, 'inventory.json')) : null;
    const dates = (report?.rows || []).filter((r: any) => r['sales-channel'] === 'Amazon.com' && !/cancel/i.test(`${r['order-status']} ${r['item-status']}`)).map((r: any) => String(r['purchase-date'] || '').slice(0, 10)).filter((value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    const todayParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const datePart = (type: string) => todayParts.find(part => part.type === type)?.value || '';
    const today = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    const recentStart = start.toISOString().slice(0, 10);
    const dormantSinceDate = new Date(`${today}T00:00:00Z`);
    dormantSinceDate.setUTCDate(dormantSinceDate.getUTCDate() - 90);
    const dormantSince = dormantSinceDate.toISOString().slice(0, 10);
    const recentUnitsByListing = new Map<string, number>();
    const seenOrderItems = new Set<string>();
    for (const row of report?.rows || []) {
      if (row['sales-channel'] !== 'Amazon.com' || /cancel/i.test(`${row['order-status']} ${row['item-status']}`)) continue;
      const orderItemId = String(row['order-item-id'] || '');
      if (orderItemId && seenOrderItems.has(orderItemId)) continue;
      if (orderItemId) seenOrderItems.add(orderItemId);
      const purchaseDate = String(row['purchase-date'] || '').slice(0, 10);
      const quantity = Number(row.quantity ?? row['quantity-purchased'] ?? 0);
      if (purchaseDate < recentStart || purchaseDate > today || !Number.isFinite(quantity) || quantity <= 0 || !row.sku || !row.asin) continue;
      const key = JSON.stringify([row.sku, row.asin]);
      recentUnitsByListing.set(key, (recentUnitsByListing.get(key) || 0) + quantity);
    }
    const inventoryByListing = new Map<string, { total: number; sellable: number; reserved: number; unsellable: number }>();
    for (const row of inventory?.payload?.inventorySummaries || []) {
      const key = JSON.stringify([row.sellerSku, row.asin]);
      const stock = inventoryByListing.get(key) || { total: 0, sellable: 0, reserved: 0, unsellable: 0 };
      stock.total += Number(row.totalQuantity || 0);
      stock.sellable += Number(row.inventoryDetails?.fulfillableQuantity || 0);
      stock.reserved += Number(row.inventoryDetails?.reservedQuantity?.totalReservedQuantity || 0);
      stock.unsellable += Number(row.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity || 0);
      inventoryByListing.set(key, stock);
    }
    const sourceProducts: any[] = state.dashboardRun?.products || [];
    const sourceByListing = new Map(sourceProducts.map((source: any) => [JSON.stringify([source.sku, source.asin]), source]));
    const coverageStart = [report?.coverageStart, report?.start, dates[0]].filter(Boolean).map((value: string) => String(value).slice(0, 10)).sort()[0] || '';
    const coverageEnd = [report?.coverageEnd, report?.end, dates.at(-1)].filter(Boolean).map((value: string) => String(value).slice(0, 10)).sort().at(-1) || '';
    const reportFresh = report?.pulledAt && Number.isFinite(Date.parse(report.pulledAt)) && Date.now() - Date.parse(report.pulledAt) <= 30 * 86400000;
    const dormantCoverageAvailable = Boolean(reportFresh && coverageStart && coverageEnd && coverageStart <= dormantSince && coverageEnd >= today);
    const products = catalogProducts(sourceProducts, report?.rows || []).map((product: any) => ({
      ...product,
      imageCount: sourceByListing.get(JSON.stringify([product.sku, product.asin]))?.images?.length || 0,
      lastSaleDate: product.sales.reduce((latest: string | null, sale: any) => sale.lastSaleDate && (!latest || sale.lastSaleDate > latest) ? sale.lastSaleDate : latest, null),
      fbaStock: sourceByListing.get(JSON.stringify([product.sku, product.asin]))?.listing?.fulfillment === 'AMAZON_NA' ? inventoryByListing.get(JSON.stringify([product.sku, product.asin])) || null : null,
      fulfillment: sourceByListing.get(JSON.stringify([product.sku, product.asin]))?.listing?.fulfillment || null,
      recent30DayUnits: recentUnitsByListing.get(JSON.stringify([product.sku, product.asin])) || 0,
    }));
    const configuredRiskDays = Number(process.env.FBA_STOCK_RISK_COVER_DAYS || 7);
    const configuredLowOrders = Number(process.env.LOW_PERFORMANCE_MAX_30_DAY_ORDERS || 5);
    const lowOrderThreshold = Number.isInteger(configuredLowOrders) && configuredLowOrders >= 1 && configuredLowOrders <= 100 ? configuredLowOrders : 5;
    const performance30Days = recentProductPerformance(report, sourceProducts, today, lowOrderThreshold);
    const stockRiskCoverDays = Number.isInteger(configuredRiskDays) && configuredRiskDays >= 1 && configuredRiskDays <= 90 ? configuredRiskDays : 7;
    return Response.json({ capturedAt: state.run?.capturedAt || null, products, performance30Days, inventoryPulledAt: inventoryInfo?.mtime.toISOString() || null, stockRiskCoverDays, salesSource: { available: Boolean(report?.rows?.length), pulledAt: report?.pulledAt || null, start: dates[0] || null, end: dates.at(-1) || null, coverageStart, coverageEnd, dormantSince, dormantCoverageAvailable } }, {headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'Saved Amazon catalog could not be loaded.'}, {status:500}); }
}
