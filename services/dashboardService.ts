type AccountId = "cdc" | "nana-jewellers";
type ImportDateRange = { startDate?: string; endDate?: string };
const accountHeaders = (accountId: AccountId) => ({ "x-cdc-account-id": accountId });
async function api<T>(url: string, init?: RequestInit, accountId: AccountId = "cdc"): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...accountHeaders(accountId), ...init?.headers } }); const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}
export const getDashboardData = (accountId: AccountId = "cdc") => api<any>("/api/dashboard", undefined, accountId);
export const getTrackingData = (accountId: AccountId = "cdc") => api<any>("/api/tracking", undefined, accountId);
export const getUploadHistory = (accountId: AccountId = "cdc") => api<any[]>("/api/uploads", undefined, accountId);
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
  window.dispatchEvent(new CustomEvent("cdc-data-updated")); return result;
}
export async function mergeAsinChange(id: string, accountId: AccountId = "cdc") { const result = await api<any>("/api/tracking/merge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }, accountId); window.dispatchEvent(new CustomEvent("cdc-data-updated")); return result; }
export async function mergeAllAsinChanges(accountId: AccountId = "cdc") { const result = await api<any>("/api/tracking/merge-all", { method: "POST" }, accountId); window.dispatchEvent(new CustomEvent("cdc-data-updated")); return result; }
export async function exportAnalytics(accountId: AccountId = "cdc") { const data = await getDashboardData(accountId); return data.salesRecords || []; }
