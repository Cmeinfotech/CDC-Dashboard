import { accessGuard } from "../../../services/accessSecurity.mjs";
import { isDatabaseConfigured } from "../../../db";
import { dashboardData, requestUserId } from "../../../services/backendService";

const emptyResponse = { orderRecords: [], total: 0, truncated: false, orderCoverage: { startDate: null, endDate: null } };

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: false });
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const startDate = params.get("startDate") || "";
  const endDate = params.get("endDate") || "";
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    return Response.json({ error: "A valid startDate and endDate are required." }, { status: 400 });
  }
  if (!isDatabaseConfigured()) return Response.json(emptyResponse);
  try {
    const data = await dashboardData(requestUserId(request), { startDate, endDate });
    return Response.json({ orderRecords: data.orderRecords, total: data.orderRecordsTotal, truncated: data.orderRecordsTruncated, orderCoverage: data.orderCoverage });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND") return Response.json({ error: "The orders database is unreachable. Check the database connection and retry." }, { status: 503 });
    console.error("Orders detail query failed", code || "database_error");
    return Response.json({ error: "Could not load order details. Check the database connection and retry." }, { status: 500 });
  }
}
