import { amazonRequest, getAmazonConfig } from "./amazonSpApi";
import { reportDownloadUrl } from './amazonTransport.mjs';
import { boundedBytes } from './boundedBody.mjs';

export type AmazonDataset = "inventory" | "orders" | "business";
export type ReportDefinition = { dataset: AmazonDataset; reportType: string; marketplaceId?: string; periodMode: "snapshot" | "date-range" };

type ReportStatus = { reportId: string; processingStatus: string; reportDocumentId?: string; processingEndTime?: string; processingStartTime?: string; }
type ReportDocument = { url: string; compressionAlgorithm?: "GZIP" };

const envName: Record<AmazonDataset, string> = { inventory: "AMAZON_INVENTORY_REPORT_TYPE", orders: "AMAZON_ORDER_REPORT_TYPE", business: "AMAZON_BUSINESS_REPORT_TYPE" };

export function getReportDefinitions(): ReportDefinition[] {
  const config = getAmazonConfig();
  return (["inventory", "orders", "business"] as AmazonDataset[]).map(dataset => ({
    dataset,
    reportType: process.env[envName[dataset]] || "",
    marketplaceId: process.env[`${envName[dataset]}_MARKETPLACE_ID`] || config.marketplaceId,
    periodMode: dataset === "inventory" ? "snapshot" : "date-range",
  }));
}

export function missingReportDefinitions() {
  return getReportDefinitions().filter(item => !item.reportType).map(item => envName[item.dataset]);
}

export async function createReport(definition: ReportDefinition, startDate?: string, endDate?: string) {
  const body: Record<string, unknown> = { reportType: definition.reportType, marketplaceIds: [definition.marketplaceId || getAmazonConfig().marketplaceId] };
  if (definition.periodMode === "date-range") {
    if (!startDate || !endDate) throw new Error(`${definition.dataset} requires a startDate and endDate.`);
    const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!valid(startDate) || !valid(endDate) || startDate > endDate || endDate > new Date().toISOString().slice(0, 10)) throw new Error('Invalid report date range.');
    if (definition.reportType === 'GET_SALES_AND_TRAFFIC_REPORT') {
      const earliest = new Date(); earliest.setUTCFullYear(earliest.getUTCFullYear() - 2);
      if (startDate < earliest.toISOString().slice(0, 10) || Date.parse(endDate) - Date.parse(startDate) >= 30 * 86400000) throw new Error('Sales and traffic reports require batches of at most 30 days within the two-year lookback.');
    }
    body.dataStartTime = `${startDate}T00:00:00Z`;
    body.dataEndTime = `${endDate}T23:59:59Z`;
  }
  return amazonRequest<{ reportId: string }>("/reports/2021-06-30/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function getReport(reportId: string) {
  return amazonRequest<ReportStatus>(`/reports/2021-06-30/reports/${encodeURIComponent(reportId)}`);
}

export async function getReportDocument(documentId: string) {
  return amazonRequest<ReportDocument>(`/reports/2021-06-30/documents/${encodeURIComponent(documentId)}`);
}

export async function downloadReport(documentId: string) {
  const { data: document } = await getReportDocument(documentId);
  const response = await fetch(reportDownloadUrl(document.url), { redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Amazon report download failed (${response.status}).`);
  const buffer = Buffer.from(await boundedBytes(response, 64 * 1024 * 1024));
  if (document.compressionAlgorithm === "GZIP") {
    const { gunzipSync } = await import("node:zlib");
    return gunzipSync(buffer, { maxOutputLength: 128 * 1024 * 1024 });
  }
  return buffer;
}

