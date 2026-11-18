function lazyTable(tables,name,build) { Object.defineProperty(tables,name,{enumerable:true,configurable:true,get(){const value=build();Object.defineProperty(tables,name,{value,enumerable:true,configurable:true});return value;}}); }
import { financePeriodSummary } from './salesProfitFinanceSummary.mjs';
import { matchRefundedOrderRecords } from './refundOrderMatching.mjs';
import { salesProfitMetricLogic } from './salesProfitMetricLogic.mjs';
const DAY = 86400000;
const numeric = value => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const sum = values => values.length && values.some(value => value == null) ? null : values.reduce((a, b) => a + b, 0);
const add = (...values) => values.some(value => value == null) ? null : values.reduce((a, b) => a + b, 0);
const round = value => value == null ? null : Math.round(value * 100) / 100;
const date = value => String(value || '').slice(0, 10);
const cancelled = row => /cancel/i.test(row['order-status'] || '');
const id = row => row['amazon-order-id'];
const quantity = row => numeric(row.quantity ?? row['quantity-purchased']);
// Blank optional charge columns in an Amazon flat-file report mean no reported charge.
const amount = (row, key) => key !== 'item-price' && Object.hasOwn(row, key) && row[key] === '' ? 0 : numeric(row[key]);
export function summarizeSalesProfitRows(rows) {
  const grouped = new Map();
  for (const row of rows) { if (!id(row)) continue; if (!grouped.has(id(row))) grouped.set(id(row), []); grouped.get(id(row)).push(row); }
  const total = rows.filter(row => Boolean(id(row))).length;
  const cancellations = rows.filter(row => id(row) && cancelled(row)).length;
  const usd = rows.filter(row => !cancelled(row) && row.currency === 'USD');
  const units = sum(rows.filter(row => row.currency === 'USD').map(quantity));
  const sales = sum(usd.map(row => amount(row, 'item-price')));
  const shipping = sum(usd.map(row => amount(row, 'shipping-price')));
  const promotions = sum(usd.map(row => add(amount(row, 'item-promotion-discount'), amount(row, 'ship-promotion-discount'))));
  const taxes = sum(usd.map(row => add(amount(row, 'item-tax'), amount(row, 'shipping-tax'), Object.hasOwn(row, 'gift-wrap-tax') ? amount(row, 'gift-wrap-tax') : 0)));
  const revenue = add(sales, shipping, promotions == null ? null : -promotions);
  return { total, cancellations, actual: total - cancellations, pending: new Set(rows.filter(row => /pending/i.test(row['order-status'] || '')).map(id)).size, units, sales, shipping, promotions, taxes, revenue, distinct: grouped.size, usdOrders: new Set(usd.map(id)).size, lines: rows.length };
}
const salesColumns = ['Period', 'Orders Placed', 'Cancelled Orders', 'Pending Orders', 'Units Sold (USD)', 'Ordered Sales (USD)', 'Shipping (USD)', 'Promotions (USD)', 'Taxes Collected (USD)', 'Gross Billed (USD)', 'Revenue After Promotions (USD)', 'USD Order Count', 'Order Lines'];
function salesRows(rows, key) {
  const groups = new Map();
  for (const row of rows) { const period = key(row); if (!groups.has(period)) groups.set(period, []); groups.get(period).push(row); }
  const displayPeriod = period => {
    const match = String(period).match(/^(\d{4}-\d{2}-\d{2})\|(\d{4}-\d{2}-\d{2})$/);
    if (!match) return period;
    const formatDate = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${formatDate(match[1])} – ${formatDate(match[2])}`;
  };
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([period, lines]) => { const s = summarizeSalesProfitRows(lines); return [displayPeriod(period), s.total, s.cancellations, s.pending, s.units, round(s.sales), round(s.shipping), round(s.promotions), round(s.taxes), round(add(s.revenue, s.taxes)), round(s.revenue), s.usdOrders, s.lines]; });
}
const orderFields = ['amazon-order-id', 'purchase-date', 'order-status', 'fulfillment-channel', 'sku', 'asin', 'product-name', 'quantity', 'currency', 'item-price', 'shipping-price', 'item-tax', 'shipping-tax', 'item-promotion-discount', 'ship-promotion-discount', 'gift-wrap-price', 'gift-wrap-tax'];
const orderColumns = ['Amazon Order ID', 'Purchase Date (UTC)', 'Order Status', 'Fulfillment Channel', 'SKU', 'ASIN', 'Product Name', 'Quantity', 'Currency', 'Item Price', 'Shipping Price', 'Item Tax', 'Shipping Tax', 'Item Promotion Discount', 'Ship Promotion Discount', 'Gift Wrap Price', 'Gift Wrap Tax'];
export function liveSalesProfit(report, finance, inventory, params, now = new Date()) {
  const end = params.get('endDate') || now.toISOString().slice(0, 10);
  const start = params.get('startDate') || new Date(Date.parse(end) - 29 * DAY).toISOString().slice(0, 10);
  const duration = Date.parse(end) - Date.parse(start) + DAY;
  const previousEnd = new Date(Date.parse(start) - DAY).toISOString().slice(0, 10);
  const previousStart = new Date(Date.parse(start) - duration).toISOString().slice(0, 10);
  const all = (report?.rows || []).filter(row => date(row['purchase-date']) && row['sales-channel'] === 'Amazon.com');
  const inRange = (rows, a, b) => rows.filter(row => date(row['purchase-date']) >= a && date(row['purchase-date']) <= b);
  const rows = inRange(all, start, end).sort((a, b) => String(b['purchase-date']).localeCompare(String(a['purchase-date'])));
  const current = summarizeSalesProfitRows(rows), previous = summarizeSalesProfitRows(inRange(all, previousStart, previousEnd));
  const coverageStart = date(report?.coverageStart || report?.start), coverageEnd = date(report?.coverageEnd || report?.end);
  const covered = (a, b) => Boolean(report && coverageStart && coverageEnd && coverageStart <= a && coverageEnd >= b);
  const currentCovered = covered(start, end), previousCovered = covered(previousStart, previousEnd);
  const metrics = [];
  const push = (label, a, b, currentAvailable = currentCovered, previousAvailable = previousCovered) => metrics.push({ label, current: currentAvailable && a != null ? typeof a === 'string' ? a : /Margin|per Order|per Unit|%/.test(label) ? a : round(a) : 'Unavailable', previous: previousAvailable && b != null ? typeof b === 'string' ? b : /Margin|per Order|per Unit|%/.test(label) ? b : round(b) : 'Unavailable' });
  for (const [label, field] of [['Total Orders', 'total'], ['Orders Before Refunds', 'actual'], ['Cancelled Orders', 'cancellations'], ['Units Sold', 'units'], ['Ordered Sales (Gross)', 'sales'], ['Shipping Charged', 'shipping'], ['Promotions', 'promotions'], ['Taxes Collected', 'taxes'], ['Revenue After Promotions (USD)', 'revenue']]) push(label, current[field], previous[field]);
  const matchedCurrent = matchRefundedOrderRecords(rows, finance, start, end);
  const matchedPrevious = matchRefundedOrderRecords(inRange(all, previousStart, previousEnd), finance, previousStart, previousEnd);
  const rangeValue = (match, kind) => match.bounds ? `${match.bounds[kind + 'Min'].toLocaleString('en-US')}–${match.bounds[kind + 'Max'].toLocaleString('en-US')}` : null;
  push('Actual Orders', matchedCurrent.available ? matchedCurrent.actualRows.length : rangeValue(matchedCurrent, 'actual'), matchedPrevious.available ? matchedPrevious.actualRows.length : rangeValue(matchedPrevious, 'actual'));
  push('Refund / Return Orders', matchedCurrent.available ? matchedCurrent.refundedRows.length : rangeValue(matchedCurrent, 'refund'), matchedPrevious.available ? matchedPrevious.refundedRows.length : rangeValue(matchedPrevious, 'refund'));
  const ratioRange = (match, units) => match.bounds && units != null && match.bounds.actualMin > 0 ? `${(units / match.bounds.actualMax).toFixed(4)}–${(units / match.bounds.actualMin).toFixed(4)}` : null;
  push('Units per Order', matchedCurrent.available && matchedCurrent.actualRows.length && current.units != null ? current.units / matchedCurrent.actualRows.length : ratioRange(matchedCurrent,current.units), matchedPrevious.available && matchedPrevious.actualRows.length && previous.units != null ? previous.units / matchedPrevious.actualRows.length : ratioRange(matchedPrevious,previous.units));
  push('Units per Order (Before Refunds)', current.actual && current.units != null ? current.units / current.actual : null, previous.actual && previous.units != null ? previous.units / previous.actual : null);
  push('Revenue per Unit', current.units ? current.revenue / current.units : null, previous.units ? previous.revenue / previous.units : null);
  for (const [label, pattern] of [['FBA orders', /^(Amazon|AFN|FBA)$/i], ['FBM orders', /^(Merchant|MFN|FBM)$/i]]) {
    const count = lines => lines.filter(row => id(row) && pattern.test(row['fulfillment-channel'] || '')).length;
    push(label, count(rows), count(inRange(all, previousStart, previousEnd)));
  }
  // Reference workbook assumption is explicit, separate from verified full costs/profit.
  const handlingPerUnit = 2;
  const handling = s => s.units == null ? null : round(s.units * handlingPerUnit);
  const provisionalProfit = s => add(s.revenue, handling(s) == null ? null : -handling(s));
  push('Handling Charges', handling(current), handling(previous));
  push('Included Estimated Cost', handling(current), handling(previous));
  push('Provisional Profit', provisionalProfit(current), provisionalProfit(previous));
  push('Provisional Profit Margin', current.revenue ? provisionalProfit(current) / current.revenue : null, previous.revenue ? provisionalProfit(previous) / previous.revenue : null);
  for (const label of ['Total Cost', 'Total Profit', 'Profit Margin']) push(label, null, null);
  const summaryOnly = params.get('_summary') === '1';
  const tables = { metrices_logic: { columns: ['KPI', 'Formula', 'Source fields / input', 'Notes'], rows: salesProfitMetricLogic } };
  if (!summaryOnly) {
  const toOrderRows = source => source.map(row => orderFields.map(field => field === 'quantity' ? quantity(row) : row[field] ?? null));
  lazyTable(tables, 'Actual Order Records', () => ({ available: currentCovered && matchedCurrent.available, columns: orderColumns, rows: toOrderRows(matchedCurrent.actualRows) }));
  lazyTable(tables, 'Refunded Order Records', () => ({ available: currentCovered && matchedCurrent.available, columns: orderColumns, rows: toOrderRows(matchedCurrent.available ? matchedCurrent.refundedRows : matchedCurrent.matchedRows) }));
  lazyTable(tables, 'Total Orders', () => ({ columns: orderColumns, rows: rows.map(row => orderFields.map(field => field === 'quantity' ? quantity(row) : row[field] ?? null)) }));
  lazyTable(tables, 'Daily Sales', () => ({ columns: salesColumns, rows: salesRows(rows, row => date(row['purchase-date'])) }));
  lazyTable(tables, 'Monthly Sales', () => ({ columns: salesColumns, rows: salesRows(rows, row => date(row['purchase-date']).slice(0, 7)) }));
  lazyTable(tables, 'Weekly Sales', () => ({ columns: salesColumns, rows: salesRows(rows, row => { const d = new Date(date(row['purchase-date'])); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); const end = new Date(d); end.setUTCDate(end.getUTCDate() + 6); return `${d.toISOString().slice(0, 10)}|${end.toISOString().slice(0, 10)}`; }) }));
  const products = new Map();
  for (const row of rows.filter(row => row.currency === 'USD')) { const key = JSON.stringify([row.asin, row.sku]); if (!products.has(key)) products.set(key, []); products.get(key).push(row); }
  tables.Product_Performance = { columns: ['ASIN', 'SKU', 'Product Name', 'Units Sold', 'Ordered Sales (USD)', 'Shipping (USD)', 'Promotions (USD)', 'Revenue After Promotions (USD)', 'Product Cost', 'Handling Cost (Estimated USD)', 'Provisional Profit (USD)'], rows: [...products.values()].map(lines => { const s = summarizeSalesProfitRows(lines); return [lines[0].asin, lines[0].sku, lines[0]['product-name'], s.units, round(s.sales), round(s.shipping), round(s.promotions), round(s.revenue), null, handling(s), round(add(s.revenue, handling(s) == null ? null : -handling(s)))]; }) };
  }
  const listingRows = inventory?.products || [];
  if (!summaryOnly) {
  tables.Listing_Snapshots = { columns: ['Snapshot Date', 'SKU', 'ASIN', 'Product Name', 'Listing Status', 'Quantity', 'Fulfillment Channel', 'Quantity Source', 'Stock Updated At'], rows: listingRows.map(row => [inventory.capturedAt, row.sku, row.asin, row.title, Array.isArray(row.listing?.status) ? row.listing.status.join(', ') : row.listing?.status, row.listing?.quantity, row.listing?.fulfillment, row.stockSource, row.stockCapturedAt]) };
  for (const [name, monthly] of [['Daily Product Sales', false], ['Monthly Product Sales', true]]) {
    const groups = new Map();
    for (const row of rows.filter(row => !cancelled(row) && row.currency === 'USD')) {
      const period = date(row['purchase-date']).slice(0, monthly ? 7 : 10);
      const key = JSON.stringify([period, row.asin, row.sku]);
      if (!groups.has(key)) groups.set(key, { period, lines: [] });
      groups.get(key).lines.push(row);
    }
    lazyTable(tables, name, () => ({ columns: [monthly ? 'Month' : 'Date', 'ASIN', 'SKU', 'Product Name', 'Units Sold', 'Order Lines', 'Item Sales (USD)', 'Shipping (USD)', 'Item Tax (USD)', 'Shipping Tax (USD)', 'Promotions (USD)', 'Gross Billed (USD)', 'Revenue After Promotions (USD)', 'Distinct Orders'], rows: [...groups.values()].map(({ period, lines }) => { const s = summarizeSalesProfitRows(lines); return [period, lines[0].asin, lines[0].sku, lines[0]['product-name'], s.units, lines.length, round(s.sales), round(s.shipping), round(sum(lines.map(row => amount(row, 'item-tax')))), round(sum(lines.map(row => amount(row, 'shipping-tax')))), round(s.promotions), round(add(s.revenue, s.taxes)), round(s.revenue), s.distinct]; }) }));
  }
  }
  const isActive = row => (Array.isArray(row.listing?.status) ? row.listing.status : [row.listing?.status]).some(status => /^active$/i.test(status || ''));
  const activeRows = listingRows.filter(isActive);
  const active = activeRows.length;
  const knownStock = activeRows.every(row => numeric(row.listing?.quantity) != null);
  const inStock = activeRows.filter(row => numeric(row.listing?.quantity) > 0).length;
  const outOfStock = activeRows.filter(row => numeric(row.listing?.quantity) === 0).length;
  const previousListingRows = inventory?.previousSnapshot?.products || [];
  const previousActiveRows = previousListingRows.filter(isActive);
  const previousStockAvailable = Boolean(inventory?.previousSnapshot) && previousActiveRows.every(row => numeric(row.listing?.quantity) != null);
  const previousInStock = previousActiveRows.filter(row => numeric(row.listing?.quantity) > 0).length;
  const previousOutOfStock = previousActiveRows.filter(row => numeric(row.listing?.quantity) === 0).length;
  push('Active & In-Stock Listings', inStock, previousInStock, Boolean(inventory) && knownStock, previousStockAvailable);
  push('Active & Out-of-Stock Listings', outOfStock, previousOutOfStock, Boolean(inventory) && knownStock, previousStockAvailable);
  push('In-Stock % of Active', active ? inStock / active : null, previousActiveRows.length ? previousInStock / previousActiveRows.length : null, Boolean(inventory) && knownStock, previousStockAvailable);
  push('Active Listings', active, previousActiveRows.length, Boolean(inventory), Boolean(inventory?.previousSnapshot));
  push('Inactive Listings', listingRows.length - active, previousListingRows.length - previousActiveRows.length, Boolean(inventory), Boolean(inventory?.previousSnapshot));
  if (!summaryOnly) {
  const events = (finance?.transactions || []).filter(event => event.sellingPartnerMetadata?.marketplaceId === (report?.marketplaceId || finance?.marketplaceId) && date(event.postedDate) >= start && date(event.postedDate) <= end);
  lazyTable(tables, 'Financial Transactions', () => ({ columns: ['Transaction ID', 'Posted Date', 'Type', 'Status', 'Order ID', 'Marketplace', 'Currency', 'Amount'], rows: events.map(event => [event.transactionId, event.postedDate, event.transactionType, event.transactionStatus, event.relatedIdentifiers?.find(item => item.relatedIdentifierName === 'ORDER_ID')?.relatedIdentifierValue, event.sellingPartnerMetadata?.marketplaceId, (event.refundAmount || event.totalAmount)?.currencyCode, (event.refundAmount || event.totalAmount)?.currencyAmount]) }));
  lazyTable(tables, 'Refund Transactions', () => ({ ...tables['Financial Transactions'], rows: tables['Financial Transactions'].rows.filter(row => /refund/i.test(String(row[2]))) }));
  lazyTable(tables, 'Financial Breakdown', () => {
  const breakdown = [];
  function leaves(nodes, event, prefix = '') {
    for (const node of nodes || []) { const path = prefix ? `${prefix} / ${node.breakdownType}` : node.breakdownType; if (node.breakdowns?.length) leaves(node.breakdowns, event, path); else breakdown.push([event.transactionId, event.postedDate, event.transactionType, event.transactionStatus, path, node.breakdownAmount?.currencyCode, node.breakdownAmount?.currencyAmount]); }
  }
  for (const event of events) leaves(event.breakdowns, event);
  return { columns: ['Transaction ID', 'Posted Date', 'Type', 'Status', 'Breakdown', 'Currency', 'Amount'], rows: breakdown };
  });
  }
  const financeSummary = (a,b) => financePeriodSummary(finance,a,b,report?.marketplaceId || finance?.marketplaceId);
  const currentFinance = financeSummary(start, end), previousFinance = financeSummary(previousStart, previousEnd);
  push('Amazon Fees (Posted USD)', currentFinance.fees, previousFinance.fees, true, true);
  push('Refunds (Posted USD)', currentFinance.refunds, previousFinance.refunds, true, true);
  if (!summaryOnly && finance?.rawEvents) lazyTable(tables, 'Legacy Financial Events', () => ({ columns: ['Event Type', 'Posted Date', 'Marketplace', 'Order ID', 'Returned Source Fields', 'Source Part'], rows: finance.rawEvents.flatMap(({ type, event }) => {
    const posted = date(event.PostedDate);
    if (posted && (posted < start || posted > end)) return [];
    const raw = JSON.stringify(event), parts = Math.max(1, Math.ceil(raw.length / 30000));
    return Array.from({ length: parts }, (_, index) => [type, event.PostedDate || null, event.MarketplaceName || 'Account-level / unspecified', event.AmazonOrderId || null, raw.slice(index * 30000, (index + 1) * 30000), (index + 1) + '/' + parts]);
  }) }));
  if (!summaryOnly && inventory?.history?.rows) { const ledgerRows = inventory.history.rows; const columns = [...new Set(ledgerRows.flatMap(row => Object.keys(row)))]; lazyTable(tables, 'Inventory Ledger History', () => ({ columns, rows: ledgerRows.map(row => columns.map(column => row[column] ?? null)) })); }
  const notes = ['Total Orders counts order records containing amazon-order-id, matching COUNT in the supplied metric logic. Cancelled Orders counts cancelled records. These are order-item record counts, not distinct order IDs.', 'Actual Orders = Total Orders - Cancelled Orders - Refund/Return Orders. Order ID + seller SKU match purchase-period records to refund item events observed through the latest complete finance pull. Each source record is excluded only once, including partial refunds. Ambiguous multi-line matches remain unavailable. These as-of counts can change with later refunds; they do not represent final lifetime returns. Orders Before Refunds is shown separately.', 'USD units sum selected-period quantities. Monetary sales use non-cancelled USD rows on Amazon.com; currencies are never added together. Net Sales = Ordered Sales + Shipping - both promotion discounts.', 'Taxes sum item tax + shipping tax + gift-wrap tax when returned. Gift-wrap tax is not present in some source reports, so the displayed taxes are the reported tax components. Taxes are excluded from profit.', 'Handling Charges = USD Units x $2.00/unit, the reference workbook estimate. Included Estimated Cost includes handling only. Provisional Profit = Net Sales - estimated handling; excludes product costs, other client costs, fees and refunds.', 'Actual Total Cost = Product Cost + Handling + Other Client Costs. Actual Total Profit = Net Sales - Amazon Fees - Refunds - Total Cost. Missing costs/finance data are not assumed to be zero.', 'Stock uses FBA fulfillable inventory joined by seller SKU for Amazon-fulfilled listings, and listing quantity for merchant-fulfilled listings. Stock snapshot: ' + (inventory?.inventoryPulledAt || inventory?.capturedAt || 'Unavailable'), 'Posted financial amounts are reported separately from purchase-date sales and are not silently combined into cohort profit. Current listing counts use the latest snapshot; previous listing comparisons use actual archived snapshots when available. Global product selections are not applied.'];
  if (!matchedCurrent.available) notes.push('Current refund matching: ' + matchedCurrent.reason);
  if (!matchedPrevious.available) notes.push('Previous refund matching: ' + matchedPrevious.reason);
  if (inventory?.previousSnapshot) notes.push('Previous stock comparison uses archived FBA quantities dated ' + inventory.previousSnapshot.inventoryPulledAt + ' with listing status dated ' + inventory.previousSnapshot.capturedAt + '.');
  if (!currentCovered) notes.unshift(`Order coverage is incomplete for ${start} – ${end}. Summary values are unavailable; detail tables show only saved rows. Pull history to fill the range.`);
  if (!previousCovered) notes.push('Previous-period order coverage is incomplete; comparison values are unavailable.');
  if (finance?.rawEvents) notes.push('Finance source: authorized v0 fallback. Posted USD fee/refund summaries include dated Amazon.com events only. Account-level or undated events remain in Legacy Financial Events and are not assigned an invented date or marketplace. Legacy shipment net totals are not returned; component amounts are in Financial Breakdown. Refund amounts use customer charge/promotion adjustments, excluding fee adjustments.');
  if (!finance) notes.push('Financial transactions have not been pulled yet.');
  else if (date(finance.start) > start || date(finance.end) < end) notes.push('Financial transaction coverage is incomplete for the selected dates.');
  return { source: 'Amazon SP-API', period: `${start} – ${end}`, previousPeriod: `${previousStart} – ${previousEnd}`, importedAt: report?.pulledAt, coverage: { startDate: coverageStart, endDate: coverageEnd }, notes, metrics, tables, assumptions: { handlingPerUnit, currency: 'USD' } };
}



