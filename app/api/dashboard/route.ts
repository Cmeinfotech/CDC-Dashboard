import { accessGuard } from "../../../services/accessSecurity.mjs";
import { isDatabaseConfigured } from "../../../db";
import { dashboardData, requestUserId } from "../../../services/backendService";

const emptyDashboard = { products: [], monthlySales: [], dailySales: [], dailySalesRecords: [], metrics: {}, granularity: "monthly", salesRecords: [], catalogRecords: [], orderRecords: [], databaseReady: false };

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: false }); if (denied) return denied;
  if (!isDatabaseConfigured()) return Response.json(emptyDashboard);
  try { return Response.json({ ...await dashboardData(requestUserId(request)), databaseReady: true }); }
  catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND") return Response.json({ error: "The dashboard database is unreachable. Start MySQL and check the configured host and port, then retry." }, { status: 503 });
    console.error("Dashboard data query failed", code || "database_error");
    return Response.json({ error: "Could not load dashboard data. Check the database schema and connection, then retry." }, { status: 500 });
  }
}
