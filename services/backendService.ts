import * as XLSX from "xlsx";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { asinHistory, changeAudit, detectedChanges, snapshotRows, uploads } from "../db/schema";
import { detectReportType, type ReportType } from "../utils/reportDetection";
import { mapHeaders } from "../utils/headerMapping";
import { monthValue, numberValue, textValue } from "../utils/dataNormalization";
import { authenticatedUser } from './accessSecurity.mjs';
import { minimizeAmazonData } from './amazonDataSecurity.mjs';
import { monitorState } from './amazonMonitorStore.mjs';
import { expireAccountData } from './dataRetention';

export const requestUserId = (request: Request) => {
  const identity = authenticatedUser(request);
  const userId = identity.dataOwnerId || identity.userId;
  const accountId = request.headers.get("x-cdc-account-id") || "cdc";
  return `${userId}::${accountId === "nana-jewellers" ? "nana-jewellers" : "cdc"}`;
};
const cleanHeader = (value: unknown) => textValue(value).replace(/\s+/g, " ");
const displayDate = (value: string) => new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`).toLocaleString();
const importDateKey = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = textValue(value); if (!raw) return "";
  if (/^\d{4,6}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial >= 1 && serial <= 100000) {
      const excelEpoch = Date.UTC(1899, 11, 30); const date = new Date(excelEpoch + Math.floor(serial) * 86400000);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
    }
  }
  // Amazon order timestamps carry an offset, but the report's calendar date is
  // the date users filter on. Converting through UTC can move an order across
  // a day boundary and make it disappear from a selected date range.
  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[Tt ])/);
  if (isoDate) return isoDate[1];
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
  const yearFirst = name.match(/(?:^|\D)(20\d{2})[-_/.](\d{1,2})(?:\D|$)/);
  if (yearFirst) {
    const year = Number(yearFirst[1]); const month = Number(yearFirst[2]);
    if (month >= 1 && month <= 12) return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const dated = name.match(/(?:^|\D)(\d{1,2})[-_/.](\d{1,2})[-_/.](\d{2,4})(?:\D|$)/);
  if (!dated) return "";
  const month = Number(dated[1]); const year = Number(dated[3].length === 2 ? `20${dated[3]}` : dated[3]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return "";
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}
// Persisting a large workbook ten rows at a time created thousands of database
// round trips.  A moderate batch keeps memory and MySQL packet sizes safe while
// making imports substantially faster.
const chunks = <T,>(values: T[], size = 250) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const jsonRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; }
    catch { return {}; }
  }
  return {};
};
const jsonChangeDetails = (value: unknown) => {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return []; } })() : value;
  return Array.isArray(parsed) ? parsed.filter((detail): detail is { field: string; previous: string; current: string } => Boolean(detail) && typeof detail === "object").map(detail => ({ field: textValue(detail.field), previous: textValue(detail.previous), current: textValue(detail.current) })) : [];
};
const normalizedCatalogKey = (value: unknown) => textValue(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const catalogField = (data: Record<string, unknown>, aliases: string[]) => {
  const entry = Object.entries(data).find(([key]) => {
    const field = normalizedCatalogKey(key);
    return aliases.some(alias => {
      const target = normalizedCatalogKey(alias);
      return field === target || field.includes(target) || target.includes(field);
    });
  });
  return textValue(entry?.[1]);
};
const hydrateSnapshotRows = (rows: typeof snapshotRows.$inferSelect[]) => rows.map(row => ({ ...row, data: jsonRecord(row.data) })) as typeof snapshotRows.$inferSelect[];
const withBusinessReportMonth = (rows: typeof snapshotRows.$inferSelect[], reportUploads: typeof uploads.$inferSelect[]) => {
  const fallbackByUpload = new Map(reportUploads.map(upload => [upload.id, reportMonthFromSheetName(upload.sheetName || upload.fileName)]));
  return rows.map(row => {
    const month = textValue(row.month); const fallbackMonth = fallbackByUpload.get(row.uploadId) || "";
    if (!fallbackMonth || (month && month !== "Unknown")) return row;
    return { ...row, month: fallbackMonth, data: { ...jsonRecord(row.data), month: fallbackMonth } };
  }) as typeof snapshotRows.$inferSelect[];
};
const required: Record<Exclude<ReportType, "unknown">, string[]> = {
  business: ["parentAsin", "childAsin", "sales", "units", "orders"], catalog: ["sku", "childAsin", "title"], orders: ["orderId", "orderDate"],
};

type ParsedRow = { recordKey: string; asin: string; parentAsin: string; sku: string; month: string; data: Record<string, unknown> };
type ParsedWorkbook = { type: Exclude<ReportType, "unknown">; sheet: string; sheets: string[]; total: number; invalid: number; rows: ParsedRow[]; revenue: number };

function normalizedCatalogObject(row: Record<string, unknown>, parentSku: string) {
  const relationship = catalogField(row, ["Parentage Level", "Parent/Child", "Relationship Type"]) || textValue(row.__EMPTY) || (parentSku ? "Child" : "Parent");
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
    else if (type === "orders") data = {
      orderId: textValue(get("orderId")),
      merchantOrderId: textValue(raw["merchant-order-id"]),
      orderDate: textValue(get("orderDate")),
      childAsin: asin,
      sku,
      title: textValue(get("title")),
      quantity: numberValue(get("quantity")),
      currency: textValue(raw.currency),
      itemPrice: numberValue(get("itemPrice")),
      itemTax: numberValue(raw["item-tax"]),
      shippingPrice: numberValue(raw["shipping-price"]),
      promotionDiscount: numberValue(raw["item-promotion-discount"]),
      status: textValue(get("orderStatus")),
      itemStatus: textValue(raw["item-status"]),
      fulfillmentChannel: textValue(raw["fulfillment-channel"]),
      salesChannel: textValue(raw["sales-channel"]),
      shipServiceLevel: textValue(raw["ship-service-level"]),
    };
    else data = minimizeAmazonData(normalizedCatalogObject(raw, textValue(get("parentSku"))));
    revenue += type === "business" ? Number(data.sales) : type === "orders" ? Number(data.itemPrice) : 0;
    rows.push({ recordKey: type === "orders" ? `${data.orderId}:${index}` : type === "business" ? `${data.date || data.month}:${parentAsin}:${asin}` : asin, asin, parentAsin, sku, month: type === "business" ? String(data.month) : "", data });
  }
  return { type, sheet: selected.name, sheets: workbook.SheetNames, total: selected.objects.length, invalid, rows, revenue };
}

export async function saveUpload(request: Request, file: File, dateRange: { startDate?: string; endDate?: string } = {}, actor = "Unknown user") {
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
  await expireAccountData(userId);
  if (parsed.type === "orders" && parsed.rows.some(row => !row.asin && row.sku)) {
    const { rows: catalogRows } = await latestRows(userId, "catalog"); const catalogBySku = new Map(catalogRows.filter(row => row.sku).map(row => [row.sku, row.asin]));
    for (const row of parsed.rows) if (!row.asin && row.sku) { const asin = catalogBySku.get(row.sku); if (asin) { row.asin = asin; row.data.childAsin = asin; } }
  }
  const [previous] = await db.select().from(uploads).where(and(eq(uploads.userId, userId), eq(uploads.reportType, parsed.type))).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(1);
  const previousRows = previous ? hydrateSnapshotRows(await db.select().from(snapshotRows).where(eq(snapshotRows.uploadId, previous.id))) : [];
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
        changeValues.push({ id: crypto.randomUUID(), userId, previousUploadId: previous.id, currentUploadId: id, kind: sameSku ? "asin" : "added", asin: current.asin, sku: current.sku, parentSku: textValue(current.data["Parent SKU"]), product: textValue(current.data.Title), previousAsin: sameSku?.asin || "", currentAsin: current.asin, details: [], confidence: 0, status: sameSku ? "Ready to merge" : "Detected" });
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
  await db.insert(changeAudit).values({ id: crypto.randomUUID(), userId, actor, action: "Uploaded", entityType: parsed.type, entityId: id, summary: `Uploaded ${file.name} (${parsed.rows.length.toLocaleString()} valid rows; ${changeValues.length.toLocaleString()} detected changes).`, details: { file: file.name, reportType: parsed.type, sheet: parsed.sheet, rows: parsed.rows.length, detectedChanges: changeValues.length, changes: changeValues.slice(0, 100).map(change => ({ kind: change.kind, product: change.product, sku: change.sku, previousAsin: change.previousAsin, currentAsin: change.currentAsin, fields: change.details })) } });
  return { file: file.name, size: file.size, type: parsed.type, sheet: parsed.sheet, sheets: parsed.sheets, rows: parsed.total, valid: parsed.rows.length, invalid: parsed.invalid, filteredOut, importedDateRange, missing: [], parents, children, products: parsed.type === "business" ? parents : parsed.rows.length, changes: changeValues.length, status: "Ready", revenue: parsed.revenue };
}

export async function latestRows(userId: string, type: string) {
  const db = getDb(); const [upload] = await db.select().from(uploads).where(and(eq(uploads.userId, userId), eq(uploads.reportType, type))).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(1);
  return { upload, rows: upload ? hydrateSnapshotRows(await db.select().from(snapshotRows).where(eq(snapshotRows.uploadId, upload.id))) : [] };
}

async function importedReportRows(userId: string, type: string) {
  const db = getDb();
  const candidates = await db.select().from(uploads).where(and(eq(uploads.userId, userId), eq(uploads.reportType, type))).orderBy(desc(uploads.createdAt), desc(uploads.id));
  const selected: typeof uploads.$inferSelect[] = []; const seenReports = new Set<string>();
  for (const upload of candidates) {
    const reportKey = upload.sheetName || upload.fileName;
    if (seenReports.has(reportKey)) continue;
    seenReports.add(reportKey); selected.push(upload);
  }
  const uploadIds = selected.map(upload => upload.id);
  const rows = uploadIds.length
    ? await db.select().from(snapshotRows).where(inArray(snapshotRows.uploadId, uploadIds))
    : [];
  return { uploads: selected, rows: hydrateSnapshotRows(rows) };
}

async function amazonOrderHistoryRows(userId: string) {
  const db = getDb();
  // Do not route the live two-year order history through importedReportRows:
  // that helper intentionally keeps only the newest upload per worksheet name,
  // so an unrelated workbook with an "Amazon Orders" sheet can mask this pull.
  const [upload] = await db.select().from(uploads)
    .where(and(
      eq(uploads.userId, userId),
      eq(uploads.reportType, "orders"),
      eq(uploads.fileName, "Amazon Two-Year Order History"),
      eq(uploads.sheetName, "Amazon Orders"),
    ))
    .orderBy(desc(uploads.createdAt), desc(uploads.id))
    .limit(1);
  const rows = upload
    ? await db.select().from(snapshotRows).where(eq(snapshotRows.uploadId, upload.id))
    : [];
  return { upload, rows: hydrateSnapshotRows(rows) };
}

export async function uploadHistory(userId: string) {
  await expireAccountData(userId);
  const rows = await getDb().select().from(uploads).where(eq(uploads.userId, userId)).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(30);
  return rows.map(row => ({ file: row.fileName, size: row.fileSize, type: row.reportType, sheet: row.sheetName, rows: row.rowCount, valid: row.validCount, invalid: row.invalidCount, date: displayDate(row.createdAt), status: "Ready", missing: [], parents: row.parentsCount, children: row.childrenCount, products: row.validCount, changes: row.changesCount, revenue: row.revenue / 100 }));
}

export async function changeAuditHistory(userId: string) {
  const rows = await getDb().select().from(changeAudit).where(eq(changeAudit.userId, userId)).orderBy(desc(changeAudit.createdAt), desc(changeAudit.id)).limit(500);
  return rows;
}

export async function trackingData(userId: string) {
  await expireAccountData(userId);
  const db = getDb(); const [{ upload: catalogUpload, rows: catalog }, { uploads: businessUploads, rows: businessRows }, { rows: orders }] = await Promise.all([latestRows(userId, "catalog"), importedReportRows(userId, "business"), importedReportRows(userId, "orders")]);
  const business = withBusinessReportMonth(businessRows, businessUploads);
  const changes = await db.select().from(detectedChanges).where(eq(detectedChanges.userId, userId)).orderBy(desc(detectedChanges.createdAt));
  const history = await db.select().from(asinHistory).where(eq(asinHistory.userId, userId)).orderBy(desc(asinHistory.mergedAt));
  const productSource = business.length ? business : catalog.map(row => ({ ...row, parentAsin: row.parentAsin || row.asin, data: { ...jsonRecord(row.data), title: catalogField(jsonRecord(row.data), ["Title", "Product Name", "Item Name", "Product Title"]) } })) as typeof business;
  const products = buildProducts(productSource, catalog, catalogUpload?.fileName || "latest Product Catalog"); const analytics = buildAnalytics(business, products, catalog, orders);
  const sourceIds = [...new Set(changes.flatMap(change => [change.previousUploadId, change.currentUploadId]).filter(Boolean) as string[])];
  const sourceAsins = [...new Set(changes.flatMap(change => [change.asin, change.previousAsin, change.currentAsin]).filter(Boolean) as string[])];
  const sourceFiles = catalogUpload && sourceIds.length ? await db.select().from(uploads).where(inArray(uploads.id, sourceIds)) : [];
  // Change detail only needs the ASINs involved in a change. Reading complete
  // previous and current catalog uploads here made the tracking page slow.
  const sourceCatalogRows = sourceIds.length && sourceAsins.length
    ? hydrateSnapshotRows(await db.select().from(snapshotRows).where(and(inArray(snapshotRows.uploadId, sourceIds), inArray(snapshotRows.asin, sourceAsins))))
    : [];
  const fileById = new Map(sourceFiles.map(row => [row.id, row.fileName]));
  const catalogContextByAsin = new Map(catalog.map(row => {
    const data = jsonRecord(row.data);
    return [row.asin, {
      sku: row.sku || catalogField(data, ["SKU", "Seller SKU"]),
      parentSku: catalogField(data, ["Parent SKU"]),
      product: catalogField(data, ["Title", "Product Name", "Item Name", "Product Title"]),
    }];
  }));
  const contextForAsin = (asin: string) => catalogContextByAsin.get(asin) || { sku: "", parentSku: "", product: "" };
  const common = (change: typeof changes[number]) => ({ asin: change.asin, sku: change.sku, parentSku: change.parentSku, detectedAt: displayDate(change.createdAt), previousFile: fileById.get(change.previousUploadId || "") || "Previous catalog", currentFile: fileById.get(change.currentUploadId) || "Current catalog" });
  const currentCatalogByAsin = new Map(catalog.map(row => [row.asin, jsonRecord(row.data)]));
  const snapshotByUploadAndAsin = new Map(sourceCatalogRows.map(row => [`${row.uploadId}::${row.asin}`, jsonRecord(row.data)]));
  const snapshotAttributes = (uploadId: string | null, asin: string) =>
    uploadId ? snapshotByUploadAndAsin.get(`${uploadId}::${asin}`) || {} : {};
  const catalogContext = (attributes: Record<string, unknown>) => ({
    sku: catalogField(attributes, ["SKU", "Seller SKU"]),
    parentSku: catalogField(attributes, ["Parent SKU"]),
    product: catalogField(attributes, ["Title", "Product Name", "Item Name", "Product Title"]),
  });
  const asinType = (attributes: Record<string, unknown>, fallbackParentSku = "") => {
    const relationship = catalogField(attributes, ["Parent/Child", "Parentage", "Parentage Level", "Relationship"]).toLowerCase();
    if (relationship.includes("parent")) return "Parent";
    if (relationship.includes("child")) return "Child";
    return catalogField(attributes, ["Parent SKU"]) || fallbackParentSku ? "Child" : "Unknown";
  };
  const catalogDetailsForChange = (change: typeof changes[number]) => ({
    previousAttributes: snapshotAttributes(change.previousUploadId, change.previousAsin || change.asin),
    currentAttributes: snapshotAttributes(change.currentUploadId, change.currentAsin || change.asin) || currentCatalogByAsin.get(change.currentAsin || change.asin) || {},
  });
  const asinChangeByPair = new Map(changes.filter(change => change.kind === "asin").map(change => [`${change.previousAsin}::${change.currentAsin}`, change]));
  return { ...analytics, asinChanges: changes.filter(c => c.kind === "asin").map(c => {
    const context = contextForAsin(c.currentAsin || c.asin);
    const details = catalogDetailsForChange(c);
    const snapshotContext = catalogContext(details.currentAttributes);
    const previousContext = catalogContext(details.previousAttributes);
    return { id: c.id, product: c.product || context.product || snapshotContext.product || previousContext.product, sku: c.sku || context.sku || snapshotContext.sku || previousContext.sku, parentSku: c.parentSku || context.parentSku || snapshotContext.parentSku || previousContext.parentSku, previous: c.previousAsin, current: c.currentAsin, changedAsinType: asinType(details.currentAttributes, c.parentSku || context.parentSku || snapshotContext.parentSku), detected: displayDate(c.createdAt), confidence: c.confidence, status: c.status, previousFile: fileById.get(c.previousUploadId || "") || "Previous catalog", currentFile: fileById.get(c.currentUploadId) || "Current catalog", ...details };
  }), asinHistory: history.map(h => {
    const context = contextForAsin(h.currentAsin);
    const change = asinChangeByPair.get(`${h.previousAsin}::${h.currentAsin}`);
    const details = change ? catalogDetailsForChange(change) : { previousAttributes: {}, currentAttributes: currentCatalogByAsin.get(h.currentAsin) || {} };
    const snapshotContext = catalogContext(details.currentAttributes);
    const previousContext = catalogContext(details.previousAttributes);
    return { product: h.product || context.product || snapshotContext.product || previousContext.product, sku: context.sku || snapshotContext.sku || previousContext.sku, parentSku: context.parentSku || snapshotContext.parentSku || previousContext.parentSku, currentAsin: h.currentAsin, previousAsins: [h.previousAsin], changedAsinType: asinType(details.currentAttributes, context.parentSku || snapshotContext.parentSku), mergedAt: displayDate(h.mergedAt), detected: change ? displayDate(change.createdAt) : "", confidence: change?.confidence ?? "", status: "Merged", previousFile: change ? fileById.get(change.previousUploadId || "") || "Previous catalog" : "Previous catalog", currentFile: change ? fileById.get(change.currentUploadId) || "Current catalog" : catalogUpload?.fileName || "Current catalog", ...details };
  }), missingAsins: changes.filter(c => c.kind === "missing").map(c => ({ ...common(c), title: c.product, ...catalogDetailsForChange(c) })), attributeChanges: changes.filter(c => c.kind === "attribute").map(c => {
    const details = jsonChangeDetails(c.details);
    const currentSnapshot = snapshotAttributes(c.currentUploadId, c.asin);
    return {
      ...common(c),
      changedFields: details.map(detail => detail.field),
      changes: details,
      // Use the exact catalog snapshot that produced the change. The live
      // catalog fallback is only needed for older uploads without snapshots.
      currentAttributes: Object.keys(currentSnapshot).length ? currentSnapshot : currentCatalogByAsin.get(c.asin) || {},
      previousAttributes: snapshotAttributes(c.previousUploadId, c.asin),
    };
  }) };
}

export function buildProducts(business: typeof snapshotRows.$inferSelect[], catalog: typeof snapshotRows.$inferSelect[], catalogFileName = "latest Product Catalog") {
  const catalogByAsin = new Map(catalog.map(row => [row.asin, row])); const groups = new Map<string, typeof business>();
  for (const row of business) { const list = groups.get(row.parentAsin) || []; list.push(row); groups.set(row.parentAsin, list); }
  return [...groups.entries()].map(([parent, rows]) => {
    const children = [...new Set(rows.map(r => r.asin))].map(asin => {
      const item = catalogByAsin.get(asin); const raw = item?.data || {};
      const itemTitle = catalogField(raw, ["Title", "Product Name", "Item Name", "Product Title"]);
      const usTitle = itemTitle || textValue(rows.find(r => r.asin === asin)?.data.title);
      return { asin, sku: item?.sku || "", parentSku: catalogField(raw, ["Parent SKU"]), label: item ? [raw.Color, raw.Size, raw.Style].filter(Boolean).join(" · ") || usTitle : usTitle || asin, title: usTitle, image: catalogField(raw, ["Image URL", "Main Image URL", "Image", "Main Image"]), attributes: raw, catalogAvailable: Boolean(item), catalogSource: item ? catalogFileName : "Not supplied in latest Product Catalog", status: catalogField(raw, ["Status", "Listing Status"]) || "Unknown" };
    });
    const first = children[0]; const firstCatalogChild = children.find(child => child.catalogAvailable) || first;
    const primaryCatalogData = firstCatalogChild?.attributes || {};
    const category = catalogField(primaryCatalogData, ["Category", "Product Category", "Product Type", "Item Type Keyword"]) || "Uncategorized";
    const parentSku = firstCatalogChild?.parentSku || "";
    const catalogChildren = children.filter(child => child.catalogAvailable).length;
    return { parent, parentSku, familyId: parentSku ? `FAM-${parentSku.replace(/[^a-z0-9]/gi, "")}` : "", name: firstCatalogChild?.title || textValue(rows.find(r => r.data.title)?.data.title) || parent, image: children.find(child => child.image)?.image || "", category, trend: "stable", catalogCoverage: `${catalogChildren} of ${children.length} child ASINs found in ${catalogFileName}`, children };
  });
}

export function buildAnalytics(business: typeof snapshotRows.$inferSelect[], products: ReturnType<typeof buildProducts>, catalog: typeof snapshotRows.$inferSelect[] = [], orders: typeof snapshotRows.$inferSelect[] = [], amazonOrdersOnly = false, amazonParentByChild = new Map<string, string>()) {
  const analyticsBusiness = amazonOrdersOnly ? [] : business;
  const monthKey = (value: string) => importDateKey(value) || value;
  const months = [...new Set(analyticsBusiness.map(row => row.month).filter(Boolean))].sort((a, b) => monthKey(a).localeCompare(monthKey(b)));
  const parentMetricsByAsin = new Map<string, { sales: number; units: number; orders: number; sessions: number; pageViews: number }>();
  const monthlySalesByParent = new Map<string, Map<string, number>>();
  for (const row of analyticsBusiness) {
    const parent = row.parentAsin;
    if (!parent) continue;
    const totals = parentMetricsByAsin.get(parent) || { sales: 0, units: 0, orders: 0, sessions: 0, pageViews: 0 };
    totals.sales += Number(row.data.sales || 0);
    totals.units += Number(row.data.units || 0);
    totals.orders += Number(row.data.orders || 0);
    totals.sessions += Number(row.data.sessions || 0);
    totals.pageViews += Number(row.data.pageViews || 0);
    parentMetricsByAsin.set(parent, totals);
    if (!row.month) continue;
    const monthTotals = monthlySalesByParent.get(row.month) || new Map<string, number>();
    monthTotals.set(parent, (monthTotals.get(parent) || 0) + Number(row.data.sales || 0));
    monthlySalesByParent.set(row.month, monthTotals);
  }
  let monthlySales = months.map(month => {
    const monthTotals = monthlySalesByParent.get(month);
    return { month, ...Object.fromEntries(products.map(product => [product.parent, monthTotals?.get(product.parent) || 0])) };
  });
  const dailyTotals = new Map<string, Record<string, string | number>>();
  for (const row of analyticsBusiness) {
    const date = textValue(row.data.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const point = dailyTotals.get(date) || { date };
    point[row.parentAsin] = Number(point[row.parentAsin] || 0) + Number(row.data.sales || 0);
    dailyTotals.set(date, point);
  }
  // A Business Report can contain only monthly totals.  In that case a dated
  // Order Export is the real source for day and week views.  We intentionally
  // do not manufacture daily values by splitting a monthly total.
  const parentByChildAsin = amazonOrdersOnly ? amazonParentByChild : new Map<string, string>([
    ...catalog.filter(row => row.asin).map(row => [row.asin, row.parentAsin || row.asin] as [string, string]),
    ...business.filter(row => row.asin && row.parentAsin).map(row => [row.asin, row.parentAsin] as [string, string]),
  ]);
  const catalogContextByAsin = new Map<string, { title: string; parentAsin: string }>(catalog.filter(row => row.asin).map(row => {
    const item = jsonRecord(row.data);
    return [row.asin, {
      title: catalogField(item, ["Title", "Product Name", "Item Name", "Product Title"]),
      parentAsin: row.parentAsin || "",
    }] as [string, { title: string; parentAsin: string }];
  }));
  const orderRecords: Record<string, any>[] = orders.map(row => {
    const childAsin = textValue(row.data.childAsin) || row.asin;
    const catalogContext = catalogContextByAsin.get(childAsin);
    return {
      ...row.data,
      orderDate: importDateKey(row.data.orderDate),
      childAsin,
      // On the live CDC dashboard the saved US Amazon catalog is authoritative;
      // order report titles can use a different locale for the same ASIN.
      title: amazonOrdersOnly ? catalogContext?.title || childAsin : textValue(row.data.title) || catalogContext?.title || "",
      parentAsin: parentByChildAsin.get(childAsin) || (amazonOrdersOnly ? childAsin : catalogContext?.parentAsin || ""),
    };
  });
  const dailyOrderRecords = new Map<string, Record<string, unknown>>();
  if (!dailyTotals.size && orders.length) {
    for (const row of orderRecords) {
      const date = textValue(row.orderDate);
      const parentAsin = textValue(row.parentAsin);
      if (!date || !parentAsin) continue;
      const sales = Number(row.itemPrice || 0);
      const units = Number(row.quantity || 0);
      const point: Record<string, string | number> = dailyTotals.get(date) || { date };
      point[parentAsin] = Number(point[parentAsin] || 0) + sales;
      dailyTotals.set(date, point);
      const childAsin = textValue(row.childAsin);
      // Do not combine different child listings into one parent-only sale.
      // Doing so hides both the child ASIN and its product title in All Product Sales.
      const key = `${date}\u001f${parentAsin}\u001f${childAsin}`;
      const aggregate = dailyOrderRecords.get(key) || { month: date.slice(0, 7), date, parentAsin, childAsin, title: textValue(row.title), sales: 0, units: 0, orders: 0, sessions: 0, pageViews: 0, conversion: 0 };
      if (!textValue(aggregate.title) && textValue(row.title)) aggregate.title = textValue(row.title);
      aggregate.sales = Number(aggregate.sales) + sales;
      aggregate.units = Number(aggregate.units) + units;
      aggregate.orders = Number(aggregate.orders) + 1;
      dailyOrderRecords.set(key, aggregate);
    }
  }
  // All Product Sales is a reporting-month table. The daily order aggregates
  // above power date analytics, but exposing them directly here made one child
  // appear multiple times under the same visible month. Roll those records up
  // by month, parent and child before they reach the sales table/export.
  const monthlyOrderRecords = new Map<string, Record<string, unknown>>();
  for (const row of dailyOrderRecords.values()) {
    const key = `${textValue(row.month)}\u001f${textValue(row.parentAsin)}\u001f${textValue(row.childAsin)}`;
    const aggregate = monthlyOrderRecords.get(key) || {
      month: textValue(row.month),
      parentAsin: textValue(row.parentAsin),
      childAsin: textValue(row.childAsin),
      title: textValue(row.title),
      sales: 0,
      units: 0,
      orders: 0,
      sessions: 0,
      pageViews: 0,
      conversion: 0,
    };
    if (!textValue(aggregate.title) && textValue(row.title)) aggregate.title = textValue(row.title);
    aggregate.sales = Number(aggregate.sales) + Number(row.sales || 0);
    aggregate.units = Number(aggregate.units) + Number(row.units || 0);
    aggregate.orders = Number(aggregate.orders) + Number(row.orders || 0);
    monthlyOrderRecords.set(key, aggregate);
  }
  // Sales Analytics in the live dashboard must use the Amazon Order History
  // pull. Business-report imports are a separate workflow and must not be
  // substituted for missing Amazon monthly totals. The order rows above are
  // already grouped by month, parent ASIN and child ASIN, so roll those real
  // pulled amounts up by month and parent for the monthly chart.
  if (amazonOrdersOnly && monthlyOrderRecords.size) {
    const orderSalesByMonth = new Map<string, Map<string, number>>();
    for (const row of monthlyOrderRecords.values()) {
      const month = textValue(row.month);
      const parent = textValue(row.parentAsin);
      if (!month || !parent) continue;
      const parentTotals = orderSalesByMonth.get(month) || new Map<string, number>();
      parentTotals.set(parent, (parentTotals.get(parent) || 0) + Number(row.sales || 0));
      orderSalesByMonth.set(month, parentTotals);
    }
    const observedMonths = [...orderSalesByMonth.keys()].sort();
    if (observedMonths.length) {
      const monthKeys: string[] = [];
      const cursor = new Date(`${observedMonths[0]}-01T00:00:00`);
      const lastMonth = new Date(`${observedMonths.at(-1)}-01T00:00:00`);
      while (cursor <= lastMonth) {
        monthKeys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      monthlySales = monthKeys.map((month) => {
        const totals = orderSalesByMonth.get(month);
        return {
          month,
          ...Object.fromEntries(products.map(product => [product.parent, totals?.get(product.parent) || 0])),
        };
      });
    }
  }
  const dailySales = [...dailyTotals.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const metrics = Object.fromEntries(products.map(product => [
    product.parent,
    parentMetricsByAsin.get(product.parent) || { sales: 0, units: 0, orders: 0, sessions: 0, pageViews: 0 },
  ]));
  const normalizedAsin = (value: unknown) => textValue(value).trim().toUpperCase();
  const childMetricsByAsin = new Map<string, { sales: number; units: number; orders: number; sessions: number; pageViews: number }>();
  for (const row of analyticsBusiness) {
    const asin = normalizedAsin(row.asin || row.data.childAsin);
    if (!asin) continue;
    const summary = childMetricsByAsin.get(asin) || { sales: 0, units: 0, orders: 0, sessions: 0, pageViews: 0 };
    summary.sales += Number(row.data.sales || 0);
    summary.units += Number(row.data.units || 0);
    summary.orders += Number(row.data.orders || 0);
    summary.sessions += Number(row.data.sessions || 0);
    summary.pageViews += Number(row.data.pageViews || 0);
    childMetricsByAsin.set(asin, summary);
  }
  const businessMetricAsins = new Set(
    [...childMetricsByAsin.entries()]
      .filter(([, metrics]) => Number(metrics.sales || 0) || Number(metrics.units || 0) || Number(metrics.orders || 0))
      .map(([asin]) => asin),
  );
  const businessSalesRecords = analyticsBusiness.map(row => ({
    ...row.data,
    month: textValue(row.data.month) || row.month,
    parentAsin: textValue(row.data.parentAsin) || row.parentAsin,
    childAsin: textValue(row.data.childAsin) || row.asin,
    asin: row.asin,
  }));
  // Use Order Export values only for child ASINs that have no Business Report
  // metrics. This keeps monthly reports from being double-counted while still
  // allowing order-only child ASINs to appear with their real activity.
  for (const order of orderRecords) {
    const asin = normalizedAsin(order.childAsin || order.asin);
    if (!asin) continue;
    if (businessMetricAsins.has(asin)) continue;
    const existing = childMetricsByAsin.get(asin);
    const summary = existing || { sales: 0, units: 0, orders: 0, sessions: 0, pageViews: 0 };
    summary.sales += Number(order.itemPrice || order.sales || order.revenue || 0);
    summary.units += Number(order.quantity || order.units || 0);
    summary.orders += Number(order.orders || (order.orderId ? 1 : 0));
    childMetricsByAsin.set(asin, summary);
  }
  const childMetrics = Object.fromEntries(childMetricsByAsin);
  // The database retains every order row. The dashboard receives compact daily
  // totals and the newest detail rows, avoiding a multi-year response that can
  // freeze the browser or delay a refresh.
  const dashboardOrderRecords = orderRecords.length > 10_000 ? orderRecords.slice(-10_000) : orderRecords;
  if (amazonOrdersOnly) {
    for (const row of monthlyOrderRecords.values()) {
      const parent = textValue(row.parentAsin);
      if (!parent) continue;
      const totals = parentMetricsByAsin.get(parent) || { sales: 0, units: 0, orders: 0, sessions: 0, pageViews: 0 };
      totals.sales += Number(row.sales || 0);
      totals.units += Number(row.units || 0);
      totals.orders += Number(row.orders || 0);
      parentMetricsByAsin.set(parent, totals);
      metrics[parent] = totals;
    }
  }
  return { products, monthlySales, dailySales, dailySalesRecords: [...dailyOrderRecords.values()], metrics, childMetrics, granularity: dailySales.length ? "daily" : "monthly", salesRecords: monthlyOrderRecords.size ? [...monthlyOrderRecords.values()] : amazonOrdersOnly ? [] : businessSalesRecords, businessSalesRecords, catalogRecords: catalog.map(row => ({ asin: row.asin, sku: textValue(row.data["Parent SKU"]), ...row.data })), orderRecords: dashboardOrderRecords };
}

export async function dashboardData(userId: string) {
  await expireAccountData(userId);
  const { rows: orders } = await amazonOrderHistoryRows(userId);
  // Live dashboard figures are sourced only from the saved Amazon order pull.
  const amazonOrders = orders;
  let amazonPulledProducts: any[] = [];
  if (userId.endsWith("::cdc")) {
    try {
      const state = await monitorState();
      amazonPulledProducts = state.dashboardRun?.products || state.run?.products || [];
    } catch {
      // Continue with the saved Amazon order pull; missing catalog details should
      // not cause manual workbook rows to be substituted into the live dashboard.
    }
  }
  const pulledProductByAsin = new Map(amazonPulledProducts.filter(product => product.asin).map(product => [textValue(product.asin), product]));
  const amazonParentByChild = new Map<string, string>();
  for (const product of amazonPulledProducts) {
    const asin = textValue(product.asin);
    const parentAsins = Array.isArray(product.parentAsins) ? product.parentAsins.map(textValue).filter(Boolean) : [];
    amazonParentByChild.set(asin, parentAsins[0] || asin);
    for (const child of Array.isArray(product.childAsins) ? product.childAsins.map(textValue).filter(Boolean) : []) amazonParentByChild.set(child, asin);
  }
  const amazonCatalog = amazonPulledProducts.filter(product => product.asin).map(product => {
    const image = (product.images || []).find((item: any) => item.variant === "MAIN")?.link || product.images?.[0]?.link || "";
    const attributes = product.attributes || {};
    const attributeText = (key: string) => {
      const value = attributes[key];
      return Array.isArray(value) ? value.map((item: any) => textValue(item?.value)).filter(Boolean).join(", ") : textValue(value);
    };
    return {
      asin: textValue(product.asin),
      sku: textValue(product.sku),
      parentAsin: amazonParentByChild.get(textValue(product.asin)) || textValue(product.asin),
      data: { Title: textValue(product.title), "Image URL": image, Category: attributeText("item_type_keyword") || attributeText("product_type"), Brand: attributeText("brand") },
    };
  }) as unknown as typeof snapshotRows.$inferSelect[];
  const amazonOrderProductSource = amazonOrders.filter(row => textValue(row.data.childAsin || row.asin)).map(row => {
    const asin = textValue(row.data.childAsin || row.asin);
    const pulledProduct = pulledProductByAsin.get(asin);
    return {
      ...row,
      asin,
      parentAsin: amazonParentByChild.get(asin) || asin,
      data: { ...jsonRecord(row.data), childAsin: asin, title: textValue(pulledProduct?.title) || asin },
    };
  }) as typeof amazonOrders;
  const products = buildProducts(amazonOrderProductSource, amazonCatalog, "Latest Amazon product pull");
  return buildAnalytics([], products, amazonCatalog, amazonOrders, true, amazonParentByChild);
}

export async function mergeChange(userId: string, id: string, actor = "Unknown user") {
  const db = getDb(); const [change] = await db.select().from(detectedChanges).where(and(eq(detectedChanges.id, id), eq(detectedChanges.userId, userId))).limit(1);
  if (!change || change.kind !== "asin") throw new Error("ASIN change was not found.");
  await db.update(detectedChanges).set({ status: "Merged" }).where(eq(detectedChanges.id, id));
  await db.insert(asinHistory).values({ userId, product: change.product, currentAsin: change.currentAsin, previousAsin: change.previousAsin });
  await db.insert(changeAudit).values({ id: crypto.randomUUID(), userId, actor, action: "Merged ASIN history", entityType: "asin", entityId: id, summary: `${change.product || change.sku || "Product"}: ${change.previousAsin} → ${change.currentAsin}`, details: { product: change.product, sku: change.sku, previousAsin: change.previousAsin, currentAsin: change.currentAsin } });
  return { id, preservedHistory: true };
}

export async function mergeAllChanges(userId: string, actor = "Unknown user") {
  const db = getDb();
  const ready = await db.select().from(detectedChanges).where(and(eq(detectedChanges.userId, userId), eq(detectedChanges.kind, "asin"), eq(detectedChanges.status, "Ready to merge")));
  for (const change of ready) {
    await db.update(detectedChanges).set({ status: "Merged" }).where(eq(detectedChanges.id, change.id));
    await db.insert(asinHistory).values({ userId, product: change.product, currentAsin: change.currentAsin, previousAsin: change.previousAsin });
  }
  if (ready.length) await db.insert(changeAudit).values(ready.map(change => ({ id: crypto.randomUUID(), userId, actor, action: "Merged ASIN history", entityType: "asin", entityId: change.id, summary: `${change.product || change.sku || "Product"}: ${change.previousAsin} → ${change.currentAsin}`, details: { product: change.product, sku: change.sku, previousAsin: change.previousAsin, currentAsin: change.currentAsin } })));
  return { merged: ready.length, preservedHistory: true };
}
