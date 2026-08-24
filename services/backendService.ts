import * as XLSX from "xlsx";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { asinHistory, detectedChanges, snapshotRows, uploads } from "../db/schema";
import { detectReportType, type ReportType } from "../utils/reportDetection";
import { mapHeaders } from "../utils/headerMapping";
import { monthValue, numberValue, textValue } from "../utils/dataNormalization";

export const requestUserId = (request: Request) => {
  const userId = request.headers.get("oai-authenticated-user-id") || "anonymous";
  const accountId = request.headers.get("x-cdc-account-id") || "cdc";
  return `${userId}::${accountId === "nana-jewellers" ? "nana-jewellers" : "cdc"}`;
};
const cleanHeader = (value: unknown) => textValue(value).replace(/\s+/g, " ");
const displayDate = (value: string) => new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`).toLocaleString();
const importDateKey = (value: unknown) => {
  const raw = textValue(value); if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const month = raw.match(/^(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(20\d{2})$/i);
  if (month) { const index = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(month[1].slice(0, 3).toLowerCase()); return `${month[2]}-${String(index + 1).padStart(2, "0")}-01`; }
  const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};
// Only retain a day when the source actually contains one. A monthly label such
// as "May 2026" is useful for monthly totals, but must not pretend to be daily data.
const preciseDateKey = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = textValue(value);
  if (!raw || /^\d{4}-\d{2}$/.test(raw) || /^(?:[A-Za-z]+)\.?\s+20\d{2}$/.test(raw)) return "";
  return importDateKey(raw);
};
function reportMonthFromSheetName(name: string) {
  const dated = name.match(/(?:^|\D)(\d{1,2})[-_/.](\d{1,2})[-_/.](\d{2,4})(?:\D|$)/);
  if (!dated) return "";
  const month = Number(dated[1]); const year = Number(dated[3].length === 2 ? `20${dated[3]}` : dated[3]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return "";
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
const chunks = <T,>(values: T[], size = 10) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const required: Record<Exclude<ReportType, "unknown">, string[]> = {
  business: ["parentAsin", "childAsin", "sales", "units", "orders"], catalog: ["sku", "childAsin", "title"], orders: ["orderId", "orderDate"],
};

type ParsedRow = { recordKey: string; asin: string; parentAsin: string; sku: string; month: string; data: Record<string, unknown> };
type ParsedWorkbook = { type: Exclude<ReportType, "unknown">; sheet: string; sheets: string[]; total: number; invalid: number; rows: ParsedRow[]; revenue: number };

function normalizedCatalogObject(row: Record<string, unknown>, parentSku: string) {
  const relationship = textValue(row.__EMPTY || row["Parent/Child"]) || (parentSku ? "Child" : "Parent");
  return { ...Object.fromEntries(Object.entries(row).filter(([key]) => cleanHeader(key) && key !== "__EMPTY" && key !== "Parent/Child").map(([key, value]) => [cleanHeader(key), value instanceof Date ? value.toISOString() : textValue(value)])), "Parent/Child": relationship };
}

function parseWorkbook(buffer: ArrayBuffer): ParsedWorkbook | { error: string[]; type: ReportType; sheet: string; sheets: string[]; total: number } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  let selected: { name: string; headers: unknown[]; objects: Record<string, unknown>[]; type: ReportType; confidence: number } | undefined;
  for (const name of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: true });
    const headerIndex = matrix.findIndex(row => Array.isArray(row) && row.filter(Boolean).length >= 3);
    if (headerIndex < 0) continue;
    const headers = matrix[headerIndex]; const detected = detectReportType(headers);
    const objects = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { range: headerIndex, defval: "", raw: true });
    if (!selected || detected.confidence > selected.confidence) selected = { name, headers, objects, type: detected.type, confidence: detected.confidence };
  }
  if (!selected) return { error: ["Readable worksheet"], type: "unknown", sheet: "", sheets: workbook.SheetNames, total: 0 };
  const mapped = mapHeaders(selected.headers);
  const missing = selected.type === "unknown" ? ["Recognizable report columns"] : required[selected.type].filter(key => !mapped[key as keyof typeof mapped]);
  if (selected.type === "unknown" || missing.length) return { error: missing, type: selected.type, sheet: selected.name, sheets: workbook.SheetNames, total: selected.objects.length };
  if (selected.objects.length > 75_000) return { error: ["Maximum 75,000 rows per upload. Split this workbook into smaller files."], type: selected.type, sheet: selected.name, sheets: workbook.SheetNames, total: selected.objects.length };
  const type = selected.type; const rows: ParsedRow[] = []; let revenue = 0; let invalid = 0;
  for (let index = 0; index < selected.objects.length; index++) {
    const raw = selected.objects[index]; const get = (key: keyof typeof mapped) => mapped[key] ? raw[mapped[key]!] : "";
    let asin = textValue(get("childAsin")); const sku = textValue(get("sku")); const parentAsin = textValue(get("parentAsin"));
    const valid = type === "business" ? !!(asin && parentAsin) : type === "catalog" ? !!(asin && sku && textValue(get("title"))) : !!(textValue(get("orderId")) && textValue(get("orderDate")));
    if (!valid) { invalid++; continue; }
    let data: Record<string, unknown>;
    if (type === "business") {
      const reportValue = mapped.month ? get("month") : reportMonthFromSheetName(selected.name);
      data = { month: monthValue(reportValue), date: mapped.month ? preciseDateKey(reportValue) : "", parentAsin, childAsin: asin, title: textValue(get("title")), sales: numberValue(get("sales")), units: numberValue(get("units")), orders: numberValue(get("orders")), sessions: numberValue(get("sessions")), pageViews: numberValue(get("pageViews")), conversion: numberValue(get("conversion")) };
    }
    else if (type === "orders") data = { orderId: textValue(get("orderId")), orderDate: textValue(get("orderDate")), childAsin: asin, sku, title: textValue(get("title")), quantity: numberValue(get("quantity")), itemPrice: numberValue(get("itemPrice")), status: textValue(get("orderStatus")) };
    else data = normalizedCatalogObject(raw, textValue(get("parentSku")));
    revenue += type === "business" ? Number(data.sales) : type === "orders" ? Number(data.itemPrice) : 0;
    rows.push({ recordKey: type === "orders" ? `${data.orderId}:${index}` : type === "business" ? `${data.date || data.month}:${parentAsin}:${asin}` : asin, asin, parentAsin, sku, month: type === "business" ? String(data.month) : "", data });
  }
  return { type, sheet: selected.name, sheets: workbook.SheetNames, total: selected.objects.length, invalid, rows, revenue };
}

export async function saveUpload(request: Request, file: File, dateRange: { startDate?: string; endDate?: string } = {}) {
  if (!/\.xlsx?$/i.test(file.name)) throw new Error("Only .xlsx or .xls workbooks are supported.");
  if (file.size > 25 * 1024 * 1024) throw new Error("Workbook exceeds the 25 MB upload limit. Split the file before uploading.");
  const parsed = parseWorkbook(await file.arrayBuffer());
  if ("error" in parsed) return { file: file.name, size: file.size, type: parsed.type, sheet: parsed.sheet, sheets: parsed.sheets, rows: parsed.total, valid: 0, invalid: parsed.total, missing: parsed.error, parents: 0, children: 0, products: 0, changes: 0, status: "Validation failed", revenue: 0 };
  const dateFilterActive = Boolean(dateRange.startDate && dateRange.endDate && parsed.type !== "catalog");
  const beforeDateFilter = parsed.rows.length;
  if (dateFilterActive) parsed.rows = parsed.rows.filter(row => { const date = importDateKey(parsed.type === "orders" ? row.data.orderDate : row.data.date || row.data.month); return Boolean(date && date >= dateRange.startDate! && date <= dateRange.endDate!); });
  parsed.revenue = parsed.rows.reduce((total, row) => total + Number(parsed.type === "orders" ? row.data.itemPrice || 0 : row.data.sales || 0), 0);
  const filteredOut = beforeDateFilter - parsed.rows.length;
  const importedDates = parsed.rows.map(row => importDateKey(parsed.type === "orders" ? row.data.orderDate : row.data.date || row.data.month)).filter(Boolean).sort();
  const importedDateRange = importedDates.length ? { start: importedDates[0], end: importedDates.at(-1) } : null;
  const db = getDb(); const userId = requestUserId(request); const id = crypto.randomUUID();
  if (parsed.type === "orders" && parsed.rows.some(row => !row.asin && row.sku)) {
    const { rows: catalogRows } = await latestRows(userId, "catalog"); const catalogBySku = new Map(catalogRows.filter(row => row.sku).map(row => [row.sku, row.asin]));
    for (const row of parsed.rows) if (!row.asin && row.sku) { const asin = catalogBySku.get(row.sku); if (asin) { row.asin = asin; row.data.childAsin = asin; } }
  }
  const [previous] = await db.select().from(uploads).where(and(eq(uploads.userId, userId), eq(uploads.reportType, parsed.type))).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(1);
  const previousRows = previous ? await db.select().from(snapshotRows).where(eq(snapshotRows.uploadId, previous.id)) : [];
  const changeValues: typeof detectedChanges.$inferInsert[] = [];
  if (parsed.type === "catalog" && previous) {
    const oldByAsin = new Map(previousRows.map(row => [row.asin, row])); const oldBySku = new Map(previousRows.filter(row => row.sku).map(row => [row.sku, row]));
    const currentAsins = new Set(parsed.rows.map(row => row.asin)); const currentSkus = new Set(parsed.rows.map(row => row.sku));
    for (const current of parsed.rows) {
      const old = oldByAsin.get(current.asin);
      if (old) {
        const allFields = new Set([...Object.keys(old.data), ...Object.keys(current.data)]); const details = [...allFields].filter(field => textValue(old.data[field]) !== textValue(current.data[field])).map(field => ({ field, previous: textValue(old.data[field]), current: textValue(current.data[field]) }));
        if (details.length) changeValues.push({ id: crypto.randomUUID(), userId, previousUploadId: previous.id, currentUploadId: id, kind: "attribute", asin: current.asin, sku: current.sku, parentSku: textValue(current.data["Parent SKU"]), product: textValue(current.data.Title), details, status: "Detected" });
      } else {
        const sameSku = oldBySku.get(current.sku);
        changeValues.push({ id: crypto.randomUUID(), userId, previousUploadId: previous.id, currentUploadId: id, kind: sameSku ? "asin" : "added", asin: current.asin, sku: current.sku, parentSku: textValue(current.data["Parent SKU"]), product: textValue(current.data.Title), previousAsin: sameSku?.asin || "", currentAsin: current.asin, details: [], confidence: sameSku ? 100 : 100, status: sameSku ? "Ready to merge" : "Detected" });
      }
    }
    for (const old of previousRows) if (!currentAsins.has(old.asin) && !currentSkus.has(old.sku)) changeValues.push({ id: crypto.randomUUID(), userId, previousUploadId: previous.id, currentUploadId: id, kind: "missing", asin: old.asin, sku: old.sku, parentSku: textValue(old.data["Parent SKU"]), product: textValue(old.data.Title), details: [], status: "Detected" });
  }
  const parents = new Set(parsed.rows.map(row => row.parentAsin).filter(Boolean)).size; const children = new Set(parsed.rows.map(row => row.asin)).size;
  await db.insert(uploads).values({ id, userId, reportType: parsed.type, fileName: file.name, fileSize: file.size, sheetName: parsed.sheet, rowCount: parsed.total, validCount: parsed.rows.length, invalidCount: parsed.invalid, parentsCount: parents, childrenCount: children, revenue: Math.round(parsed.revenue * 100), changesCount: changeValues.length });
  try {
    for (const group of chunks(parsed.rows)) await db.insert(snapshotRows).values(group.map(row => ({ uploadId: id, userId, reportType: parsed.type, ...row })));
    for (const group of chunks(changeValues, 5)) if (group.length) await db.insert(detectedChanges).values(group);
  } catch (error) { await db.delete(uploads).where(eq(uploads.id, id)); throw error; }
  return { file: file.name, size: file.size, type: parsed.type, sheet: parsed.sheet, sheets: parsed.sheets, rows: parsed.total, valid: parsed.rows.length, invalid: parsed.invalid, filteredOut, importedDateRange, missing: [], parents, children, products: parsed.type === "business" ? parents : parsed.rows.length, changes: changeValues.length, status: "Ready", revenue: parsed.revenue };
}

export async function latestRows(userId: string, type: string) {
  const db = getDb(); const [upload] = await db.select().from(uploads).where(and(eq(uploads.userId, userId), eq(uploads.reportType, type))).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(1);
  return { upload, rows: upload ? await db.select().from(snapshotRows).where(eq(snapshotRows.uploadId, upload.id)) : [] };
}

export async function uploadHistory(userId: string) {
  const rows = await getDb().select().from(uploads).where(eq(uploads.userId, userId)).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(30);
  return rows.map(row => ({ file: row.fileName, size: row.fileSize, type: row.reportType, sheet: row.sheetName, rows: row.rowCount, valid: row.validCount, invalid: row.invalidCount, date: displayDate(row.createdAt), status: "Ready", missing: [], parents: row.parentsCount, children: row.childrenCount, products: row.validCount, changes: row.changesCount, revenue: row.revenue / 100 }));
}

export async function trackingData(userId: string) {
  const db = getDb(); const [{ upload: catalogUpload, rows: catalog }, { rows: business }] = await Promise.all([latestRows(userId, "catalog"), latestRows(userId, "business")]);
  const changes = await db.select().from(detectedChanges).where(eq(detectedChanges.userId, userId)).orderBy(desc(detectedChanges.createdAt));
  const history = await db.select().from(asinHistory).where(eq(asinHistory.userId, userId)).orderBy(desc(asinHistory.mergedAt));
  const products = buildProducts(business, catalog); const analytics = buildAnalytics(business, products);
  const sourceIds = [...new Set(changes.flatMap(change => [change.previousUploadId, change.currentUploadId]).filter(Boolean) as string[])];
  const sourceFiles = catalogUpload && sourceIds.length ? await db.select().from(uploads).where(inArray(uploads.id, sourceIds)) : [];
  const fileById = new Map(sourceFiles.map(row => [row.id, row.fileName]));
  const common = (change: typeof changes[number]) => ({ asin: change.asin, sku: change.sku, parentSku: change.parentSku, detectedAt: displayDate(change.createdAt), previousFile: fileById.get(change.previousUploadId || "") || "Previous catalog", currentFile: fileById.get(change.currentUploadId) || "Current catalog" });
  return { ...analytics, childMetrics: {}, asinChanges: changes.filter(c => c.kind === "asin").map(c => ({ id: c.id, product: c.product, previous: c.previousAsin, current: c.currentAsin, detected: displayDate(c.createdAt), confidence: c.confidence, status: c.status })), asinHistory: history.map(h => ({ product: h.product, currentAsin: h.currentAsin, previousAsins: [h.previousAsin], mergedAt: displayDate(h.mergedAt) })), missingAsins: changes.filter(c => c.kind === "missing").map(c => ({ ...common(c), title: c.product })), attributeChanges: changes.filter(c => c.kind === "attribute").map(c => ({ ...common(c), changedFields: c.details.map(d => d.field), changes: c.details })) };
}

export function buildProducts(business: typeof snapshotRows.$inferSelect[], catalog: typeof snapshotRows.$inferSelect[]) {
  const catalogByAsin = new Map(catalog.map(row => [row.asin, row])); const groups = new Map<string, typeof business>();
  for (const row of business) { const list = groups.get(row.parentAsin) || []; list.push(row); groups.set(row.parentAsin, list); }
  return [...groups.entries()].map(([parent, rows]) => {
    const children = [...new Set(rows.map(r => r.asin))].map(asin => {
      const item = catalogByAsin.get(asin); const raw = item?.data || {};
      return { asin, sku: item?.sku || "", parentSku: textValue(raw["Parent SKU"]), label: item ? [raw.Color, raw.Size, raw.Style].filter(Boolean).join(" · ") || textValue(raw.Title) : textValue(rows.find(r => r.asin === asin)?.data.title) || asin, title: textValue(raw.Title) || textValue(rows.find(r => r.asin === asin)?.data.title), attributes: raw, status: "Active" };
    });
    const first = children[0];
    return { parent, parentSku: first?.parentSku || "", familyId: first?.parentSku ? `FAM-${first.parentSku.replace(/[^a-z0-9]/gi, "")}` : "", name: textValue(rows.find(r => r.data.title)?.data.title) || first?.title || parent, category: "Imported", trend: "stable", children };
  });
}

export function buildAnalytics(business: typeof snapshotRows.$inferSelect[], products: ReturnType<typeof buildProducts>, catalog: typeof snapshotRows.$inferSelect[] = [], orders: typeof snapshotRows.$inferSelect[] = []) {
  const monthKey = (value: string) => importDateKey(value) || value;
  const months = [...new Set(business.map(row => row.month).filter(Boolean))].sort((a, b) => monthKey(a).localeCompare(monthKey(b)));
  const monthlySales = months.map(month => ({ month, ...Object.fromEntries(products.map(product => [product.parent, business.filter(row => row.month === month && row.parentAsin === product.parent).reduce((sum, row) => sum + Number(row.data.sales || 0), 0)])) }));
  const dailyTotals = new Map<string, Record<string, number>>();
  for (const row of business) {
    const date = textValue(row.data.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const point = dailyTotals.get(date) || { date };
    point[row.parentAsin] = (point[row.parentAsin] || 0) + Number(row.data.sales || 0);
    dailyTotals.set(date, point);
  }
  const dailySales = [...dailyTotals.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const metrics = Object.fromEntries(products.map(product => { const rows = business.filter(row => row.parentAsin === product.parent); return [product.parent, { sales: rows.reduce((s, r) => s + Number(r.data.sales || 0), 0), units: rows.reduce((s, r) => s + Number(r.data.units || 0), 0), orders: rows.reduce((s, r) => s + Number(r.data.orders || 0), 0), sessions: rows.reduce((s, r) => s + Number(r.data.sessions || 0), 0), pageViews: rows.reduce((s, r) => s + Number(r.data.pageViews || 0), 0) }]; }));
  return { products, monthlySales, dailySales, metrics, granularity: dailySales.length ? "daily" : "monthly", salesRecords: business.map(row => row.data), catalogRecords: catalog.map(row => ({ asin: row.asin, sku: row.sku, parentSku: textValue(row.data["Parent SKU"]), ...row.data })), orderRecords: orders.map(row => row.data) };
}

export async function dashboardData(userId: string) { const [{ upload: businessUpload, rows: business }, { rows: catalog }, { rows: orders }] = await Promise.all([latestRows(userId, "business"), latestRows(userId, "catalog"), latestRows(userId, "orders")]); const fallbackMonth = reportMonthFromSheetName(businessUpload?.sheetName || ""); const enrichedBusiness = fallbackMonth ? business.map(row => row.month === "Unknown" || !row.month ? { ...row, month: fallbackMonth, data: { ...row.data, month: fallbackMonth } } : row) : business; const products = buildProducts(enrichedBusiness, catalog); return buildAnalytics(enrichedBusiness, products, catalog, orders); }

export async function mergeChange(userId: string, id: string) {
  const db = getDb(); const [change] = await db.select().from(detectedChanges).where(and(eq(detectedChanges.id, id), eq(detectedChanges.userId, userId))).limit(1);
  if (!change || change.kind !== "asin") throw new Error("ASIN change was not found.");
  await db.update(detectedChanges).set({ status: "Merged" }).where(eq(detectedChanges.id, id));
  await db.insert(asinHistory).values({ userId, product: change.product, currentAsin: change.currentAsin, previousAsin: change.previousAsin });
  return { id, preservedHistory: true };
}

export async function mergeAllChanges(userId: string) {
  const db = getDb();
  const ready = await db.select().from(detectedChanges).where(and(eq(detectedChanges.userId, userId), eq(detectedChanges.kind, "asin"), eq(detectedChanges.status, "Ready to merge")));
  for (const change of ready) {
    await db.update(detectedChanges).set({ status: "Merged" }).where(eq(detectedChanges.id, change.id));
    await db.insert(asinHistory).values({ userId, product: change.product, currentAsin: change.currentAsin, previousAsin: change.previousAsin });
  }
  return { merged: ready.length, preservedHistory: true };
}
