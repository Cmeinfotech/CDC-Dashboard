type AccountId = "cdc" | "nana-jewellers";
type ImportDateRange = { startDate?: string; endDate?: string };
type CacheEntry = { expiresAt: number; value: unknown };

// Pages share these requests. Keep a short cache so navigation and repeated
// refresh events do not make the browser download the same large dataset twice.
const responseCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<unknown>>();
const CACHE_DURATION_MS = 15_000;

const accountHeaders = (accountId: AccountId) => ({ "x-cdc-account-id": accountId });
const requestKey = (url: string, accountId: AccountId) => `${accountId}:${url}`;

function clearAccountCache(accountId: AccountId) {
  const prefix = `${accountId}:`;
  for (const key of responseCache.keys()) if (key.startsWith(prefix)) responseCache.delete(key);
}
export const invalidateDashboardCache = (accountId: AccountId = "cdc") => clearAccountCache(accountId);

async function api<T>(url: string, init?: RequestInit, accountId: AccountId = "cdc", cacheDurationMs = CACHE_DURATION_MS): Promise<T> {
  const isReadRequest = (init?.method || "GET").toUpperCase() === "GET";
  const key = requestKey(url, accountId);
  const cached = isReadRequest ? responseCache.get(key) : undefined;
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const activeRequest = isReadRequest ? pendingRequests.get(key) : undefined;
  if (activeRequest) return activeRequest as Promise<T>;

  const request = (async () => {
    const response = await fetch(url, { ...init, headers: { ...accountHeaders(accountId), ...init?.headers } });
    const body = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    if (isReadRequest) responseCache.set(key, { value: body, expiresAt: Date.now() + cacheDurationMs });
    return body;
  })();

  if (!isReadRequest) return request;
  pendingRequests.set(key, request);
  try { return await request; }
  finally { pendingRequests.delete(key); }
}
export const getDashboardData = (accountId: AccountId = "cdc") => api<any>("/api/dashboard", undefined, accountId);
export const getTrackingData = (accountId: AccountId = "cdc") => api<any>("/api/tracking", undefined, accountId);
export const getUploadHistory = (accountId: AccountId = "cdc") => api<any[]>("/api/uploads", undefined, accountId);
export const getChangeHistory = (accountId: AccountId = "cdc") => api<any>("/api/change-history", undefined, accountId, 0);
export const getAmazonStatus = () => api<any>("/api/amazon/status");
export const getAmazonTrackingCatalog = () => api<any>("/api/amazon/tracking-catalog", undefined, "cdc", 60_000);
export const getAmazonMonitorData = () => api<any>("/api/amazon/monitor", undefined, "cdc", 10_000);
export const getAmazonProductCatalog = getAmazonTrackingCatalog;
export const invalidateAmazonMonitorCache = () => responseCache.delete(requestKey("/api/amazon/monitor", "cdc"));
export async function processExcelUpload(file: File, onProgress?: (step: string, percent: number) => void, accountId: AccountId = "cdc", dateRange?: ImportDateRange) {
  const form = new FormData(); form.append("file", file); if (dateRange?.startDate) form.append("startDate", dateRange.startDate); if (dateRange?.endDate) form.append("endDate", dateRange.endDate); onProgress?.("Starting upload…", 0);
  const result = await new Promise<any>((resolve, reject) => {
    const request = new XMLHttpRequest(); request.open("POST", "/api/uploads"); request.setRequestHeader("x-cdc-account-id", accountId); request.responseType = "json";
    request.upload.addEventListener("progress", event => {
      if (!event.lengthComputable) return onProgress?.("Uploading workbook…", 0);
      const percent = Math.min(99, Math.max(1, Math.round((event.loaded / event.total) * 100)));
      onProgress?.(`Uploading ${file.name}`, percent);
    });
    request.upload.addEventListener("loadend", () => onProgress?.("Upload complete — processing workbook…", 100));
    request.addEventListener("load", () => {
      const body = request.response || (() => { try { return JSON.parse(request.responseText); } catch { return {}; } })();
      if (request.status < 200 || request.status >= 300) return reject(new Error(body?.error || `Request failed (${request.status}).`));
      resolve(body);
    });
    request.addEventListener("error", () => reject(new Error("Network error while uploading workbook.")));
    request.send(form);
  });
  clearAccountCache(accountId); window.dispatchEvent(new CustomEvent("cdc-data-updated")); return result;
}
export async function mergeAsinChange(id: string, accountId: AccountId = "cdc") { const result = await api<any>("/api/tracking/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }, accountId); clearAccountCache(accountId); window.dispatchEvent(new CustomEvent("cdc-data-updated")); return result; }
export async function mergeAllAsinChanges(accountId: AccountId = "cdc") { const result = await api<any>("/api/tracking/merge-all", { method: "POST" }, accountId); clearAccountCache(accountId); window.dispatchEvent(new CustomEvent("cdc-data-updated")); return result; }
export async function exportAnalytics(accountId: AccountId = "cdc") { const data = await getDashboardData(accountId); return data.salesRecords || []; }
