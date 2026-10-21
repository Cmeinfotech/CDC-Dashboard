import * as XLSX from "xlsx";

const rowsToSheet = (rows: unknown[][]) => XLSX.utils.aoa_to_sheet(rows);
const money = (value: unknown) => Number(value || 0);
const text = (value: unknown) => String(value ?? "");
const dateValue = (value: unknown) => { const date = new Date(text(value)); return Number.isNaN(date.getTime()) ? undefined : date; };
// A reporting month is valid for monthly totals but must never be presented as
// a made-up daily result in the exported workbook.
const preciseDateValue = (value: unknown) => {
  const raw = text(value).trim();
  if (!raw || /^\d{4}-\d{2}$/.test(raw) || /^(?:[a-z]+)\.?\s+20\d{2}$/i.test(raw)) return undefined;
  return dateValue(raw);
};
const day = (date: Date) => date.toISOString().slice(0, 10);
const weekStart = (date: Date) => { const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7)); return day(copy); };
const addTotals = (map: Map<string, any>, key: string, row: any) => { const current = map.get(key) || { orders: 0, units: 0, sales: 0 }; current.orders += money(row.orders ?? 1); current.units += money(row.quantity ?? row.units); current.sales += money(row.itemPrice ?? row.sales); map.set(key, current); };
const setColumns = (sheet: XLSX.WorkSheet, widths: number[]) => { sheet["!cols"] = widths.map(wch => ({ wch })); };
const append = (workbook: XLSX.WorkBook, name: string, rows: unknown[][], widths: number[]) => { const sheet = rowsToSheet(rows); setColumns(sheet, widths); XLSX.utils.book_append_sheet(workbook, sheet, name); };
const normalizedField = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const findChange = (changes: any[], aliases: string[]) => changes.find(change => {
  const field = normalizedField(change.field);
  return aliases.some(alias => field.includes(normalizedField(alias)) || normalizedField(alias).includes(field));
});
const catalogValue = (catalog: Record<string, unknown>, aliases: string[]) => {
  const entry = Object.entries(catalog).find(([key]) => {
    const field = normalizedField(key);
    return aliases.some(alias => field === normalizedField(alias) || field.includes(normalizedField(alias)) || normalizedField(alias).includes(field));
  });
  return text(entry?.[1]);
};
const currentValue = (change: any, catalog: Record<string, unknown>, aliases: string[]) => text(change?.current) || catalogValue(catalog, [...aliases, text(change?.field)]);
const suppliedValue = (value: unknown) => text(value).trim() || "Not supplied";
const trackingValue = (value: unknown) => Array.isArray(value) ? value.filter(Boolean).join(" | ") : text(value);
const monitorChangeType = (change: any) => change.kind === "asin" ? "ASIN replacement" : change.field === "parentAsins" ? "Parent ASIN relationship" : "Child ASIN relationship";

export function exportAnalyticsWorkbook(data: any, tracking: any) {
  const records = data.salesRecords || [];
  const products = data.products || [];
  const monthly = data.monthlySales || [];
  const childRows = records.map((row: any) => [row.month || "", row.parentAsin || "", row.childAsin || "", row.title || "", money(row.units), money(row.sales), money(row.orders)]);
  const grouped = new Map<string, any>();
  for (const row of records) { const current = grouped.get(row.childAsin) || { ...row, units: 0, sales: 0, orders: 0 }; current.units += money(row.units); current.sales += money(row.sales); current.orders += money(row.orders); grouped.set(row.childAsin, current); }
  const productByChild = new Map<string, any>();
  for (const product of products) {
    for (const [index, child] of (product.children || []).entries()) {
      // Some catalog uploads omit child SKU values. Keep export and screen data
      // consistent by using the same readable fallback shown in the catalogue.
      const displaySku = text(child.sku).trim();
      productByChild.set(child.asin, {
        ...child,
        displaySku,
        parentAsin: product.parent,
        parentSku: product.parentSku || child.parentSku || "",
        familyId: product.familyId || "",
        productName: product.name,
      });
    }
  }
  const catalogByAsin = new Map<string, Record<string, any>>((data.catalogRecords || []).map((row: any) => [row.asin || row.ASIN, row]));
  const monitorChanges = (tracking.amazonTrackingChanges || []).filter((change: any) => change.kind === "asin" || change.kind === "family");
  const historyByOld = new Map<string, string>([
    ...(tracking.asinHistory || []).flatMap((row: any) => (row.previousAsins || []).map((previous: string) => [previous, row.currentAsin])),
    ...monitorChanges.filter((change: any) => change.kind === "asin").flatMap((change: any) => (Array.isArray(change.previous) ? change.previous : [change.previous]).filter(Boolean).map((previous: string) => [previous, trackingValue(change.current)])),
  ]);
  const childContext = (asin: string) => {
    const currentAsin = historyByOld.get(asin) || asin;
    const catalogRow = catalogByAsin.get(currentAsin) || {};
    const product = productByChild.get(asin) || productByChild.get(currentAsin) || {};
    const parentSku = product.parentSku || catalogValue(catalogRow, ["Parent SKU"]) || catalogRow.parentSku || "";
    return {
      sku: product.sku || product.displaySku || catalogRow.sku || catalogValue(catalogRow, ["SKU", "Seller SKU"]) || "",
      parentSku,
      familyId: product.familyId || (parentSku ? `FAM-${parentSku.replace(/[^a-z0-9]/gi, "")}` : ""),
      parentAsin: product.parentAsin || "",
      productName: product.productName || product.title || catalogValue(catalogRow, ["Title", "Product Name", "Item Name", "Product Title"]),
    };
  };
  const monthlyTotals = new Map<string, any>(); for (const row of records) { const key = text(row.month === "Unknown" ? "" : row.month); const current = monthlyTotals.get(key) || { month: key, units: 0, sales: 0 }; current.units += money(row.units); current.sales += money(row.sales); monthlyTotals.set(key, current); }
  // Prefer the original Order Export. If it has not been retained in this
  // browser payload, use the same real dated sales records shown in the app.
  const orderRows = data.orderRecords || [];
  const datedRows = orderRows.some((row: any) => preciseDateValue(row.orderDate || row.date)) ? orderRows : records;
  const dailyTotals = new Map<string, any>(); const weeklyTotals = new Map<string, any>(); for (const row of datedRows) { const date = preciseDateValue(row.orderDate || row.date); if (date) { addTotals(dailyTotals, day(date), row); addTotals(weeklyTotals, weekStart(date), row); } }
  const wb = XLSX.utils.book_new();
  const totalSales = records.reduce((s:number,r:any)=>s+money(r.sales),0); const totalUnits = records.reduce((s:number,r:any)=>s+money(r.units),0);
  append(wb, "Product Overview", [["Product Analytics Overview", ""], ["Consolidated product-level history from Amazon order pulls", ""], [], ["Key Performance Indicators", ""], ["Products", products.length], ["Child ASINs", grouped.size], ["Gross Sales", totalSales], ["Orders", records.reduce((s:number,r:any)=>s+money(r.orders),0)], ["Units Sold", totalUnits], ["Average Selling Price ($)", totalUnits ? totalSales / totalUnits : 0]], [38, 62]);
  const dailyRows = [...dailyTotals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,row])=>[date,row.orders,row.units,row.sales,row.orders?row.sales/row.orders:0,row.orders?row.units/row.orders:0]);
  const weeklyRows = [...weeklyTotals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([start,row])=>{const end=new Date(`${start}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+6);return [start,day(end),row.orders,row.units,row.sales,row.orders?row.sales/row.orders:0,row.orders?row.units/row.orders:0]});
  append(wb, "Daily Sales", [["Daily Sales Analytics — Order-Level Data", "", "", "", "", ""], ["Date","Orders","Units Sold","Revenue ($)","Avg Order Value ($)","Avg Units / Order"], ...(dailyRows.length ? dailyRows : [["No dated Order Export data is available for Daily Sales.", "", "", "", "", ""]])], [16,14,14,18,20,20]);
  append(wb, "Weekly Sales", [["Weekly Sales Analytics — Order-Level Data", "", "", "", "", "", ""], ["Week Start","Week End","Orders","Units Sold","Revenue ($)","Avg Order Value ($)","Avg Units / Order"], ...(weeklyRows.length ? weeklyRows : [["No dated Order Export data is available for Weekly Sales.", "", "", "", "", "", ""]])], [16,16,14,14,18,20,20]);
  append(wb, "Monthly Sales", [["Monthly Sales Analytics — Amazon order pull", "", "", ""], ["Month","Units Ordered","Ordered Product Sales ($)","Avg Selling Price ($)"], ...[...monthlyTotals.values()].map(row=>[row.month,row.units,row.sales,row.units?row.sales/row.units:0])], [18,18,24,22]);
  append(wb, "Product Level Track", [["Product Level Track — Monthly, by Parent & Child ASIN", "", "", "", "", "", ""], ["Month","Parent ASIN","Child ASIN","Child SKU","Units","Sales","Orders"], ...records.map((row:any)=>{const product=childContext(row.childAsin);return [row.month === "Unknown" ? "" : row.month||"",row.parentAsin||product.parentAsin,row.childAsin||"",product.sku,money(row.units),money(row.sales),money(row.orders)]})], [16,16,16,20,12,16,12]);
  const legacyHistoryRows = (tracking.asinHistory || []).map((r:any)=>{const product=childContext(r.currentAsin);return [r.product||product.productName,r.sku||product.sku,r.parentSku||product.parentSku,product.familyId,(r.previousAsins||[]).join(" | "),r.currentAsin,"ASIN replacement",`${(r.previousAsins||[]).join(" | ")} = Historical; ${r.currentAsin} = Current`,r.mergedAt,r.mergedAt,"Catalog comparison: same seller SKU.","High"]});
  const amazonTrackingRows = monitorChanges.flatMap((change: any) => {
    const product = childContext(change.asin || trackingValue(change.current));
    const audit = Array.isArray(change.audit) && change.audit.length ? change.audit : [{ action: change.status || "Detected", at: change.linkedAt || change.detectedAt, previousParentAsins: change.previous, currentParentAsins: change.current }];
    return audit.map((event: any) => [
      change.title || product.productName,
      change.sku || product.sku,
      product.parentSku,
      product.familyId,
      trackingValue(event.previousParentAsins ?? change.previous),
      trackingValue(event.currentParentAsins ?? change.current),
      monitorChangeType(change),
      event.action === "Reversed" ? "Reversed" : change.status || "Detected",
      change.detectedAt || "",
      event.at || change.linkedAt || change.detectedAt || "",
      "Amazon complete-pull comparison: seller SKU matched.",
      change.kind === "asin" ? "High" : "Relationship change",
    ]);
  });
  const asinHistoryRows = [...amazonTrackingRows, ...legacyHistoryRows];
  append(wb, "ASIN History", [["ASIN Tracking History — Amazon pulls, merges and reversals", "", "", "", "", "", "", "", "", "", "", ""], ["Product","SKU","Parent SKU","Product/Family ID","Previous value","Current value","Change Type","History Status","Detected Date","Latest Action Date","Evidence Used","Match Confidence"], ...(asinHistoryRows.length ? asinHistoryRows : [["No ASIN tracking history is available.", "", "", "", "", "", "", "", "", "", "", ""]])], [48,18,18,24,22,22,28,24,22,22,64,22]);
  const attributeRows = (tracking.attributeChanges || []).map((r:any) => {
    const current = r.currentAttributes || catalogByAsin.get(r.asin) || productByChild.get(r.asin)?.attributes || {};
    const changes = r.changes || [];
    const titleChange = findChange(changes, ["title", "product name", "item name"]);
    const colorChange = findChange(changes, ["color", "finish"]);
    const sizeChange = findChange(changes, ["size"]);
    const metalChange = findChange(changes, ["metal type", "metal", "material"]);
    const diamondChange = findChange(changes, ["diamond weight", "diamond", "carat"]);
    const styleChange = findChange(changes, ["style"]);
    const previousTitle = text(titleChange?.previous);
    const currentTitle = currentValue(titleChange, current, ["title", "product name", "item name"]) || text(productByChild.get(r.asin)?.title) || text(r.product);
    const currentChanges = changes.map((change:any) => `${text(change.field)}: ${suppliedValue(currentValue(change, current, [text(change.field)]))}`).join(" | ");
    return [
      suppliedValue(r.asin),
      suppliedValue(r.sku),
      suppliedValue(previousTitle),
      suppliedValue(currentTitle),
      previousTitle ? (previousTitle === currentTitle ? "No change detected" : "Changed") : "",
      suppliedValue(currentValue(colorChange, current, ["color", "finish"])),
      suppliedValue(currentValue(sizeChange, current, ["size"])),
      suppliedValue(currentValue(metalChange, current, ["metal type", "metal", "material"])),
      suppliedValue(currentValue(diamondChange, current, ["diamond weight", "diamond", "carat"])),
      suppliedValue(currentValue(styleChange, current, ["style"])),
      suppliedValue([text(colorChange?.previous), text(sizeChange?.previous), text(diamondChange?.previous)].filter(Boolean).join(" | ")),
      suppliedValue(changes.map((change:any) => text(change.field)).join(" | ")),
      currentChanges,
    ];
  });
  append(wb, "Attribute Change Tracking", [["Attribute Change Tracking — Current vs previous catalog snapshots", "", "", "", "", "", "", "", "", "", "", "", ""], ["Child ASIN","Child SKU","Title — Previous Catalog","Title — Current Catalog","Title Changed?","Current Color/Finish (Catalog)","Current Size (Catalog)","Current Metal Type (Catalog)","Current Diamond Weight (Catalog)","Current Style (Catalog)","Previous Color/Size/Weight (Catalog)","Changed attributes","Current changed values"], ...attributeRows], [16,18,42,42,18,28,18,24,24,28,42,42,64]);
  append(wb, "Child ASIN Analysis", [["Child ASIN Analysis — Current and historical catalog status", "", "", "", "", "", "", "", "", ""], ["Child ASIN","SKU","Parent ASIN(s) Observed","Current/Historical Status","Units","Sales","Orders","First Observed Month","Last Observed Month","In Current Catalog?"], ...[...grouped.values()].map((r:any)=>{const product=childContext(r.childAsin);const history=(tracking.asinHistory||[]).find((item:any)=>item.currentAsin===r.childAsin||item.previousAsins?.includes(r.childAsin));const month=r.month === "Unknown" ? "" : r.month||"";return [r.childAsin,product.sku,history?`${history.previousAsins.join(" | ")} → ${history.currentAsin}`:r.parentAsin||product.parentAsin||"",history?"Retained (Historical → Current)":"Current",r.units,r.sales,r.orders,month,month,catalogByAsin.has(historyByOld.get(r.childAsin)||r.childAsin)?"Yes":"No"]})], [16,20,30,30,12,16,12,20,20,20]);
  const asinChangeRows = (tracking.asinChanges || []).map((r:any)=>{const product=childContext(r.current);return [r.product||product.productName,r.previous,r.current,r.sku||product.sku,r.parentSku||product.parentSku,r.confidence,r.status,r.detected]});
  append(wb, "ASIN Change Analysis", [["ASIN Change Analysis / Reconciliation", ""], ["Detected ASIN Changes", asinChangeRows.length], [], ["Product","Previous ASIN","Current ASIN","SKU","Parent SKU","Confidence","Status","Detected"], ...(asinChangeRows.length ? asinChangeRows : [["No ASIN changes were detected in the imported catalog snapshots.", "", "", "", "", "", "", ""]])], [48,18,18,18,18,14,20,24]);
  XLSX.writeFile(wb, `CDC-analytics-report-${new Date().toISOString().slice(0,10)}.xlsx`);
}
