import { accessGuard } from "../../../services/accessSecurity.mjs";
import { isDatabaseConfigured } from "../../../db";
import { dashboardData, requestUserId } from "../../../services/backendService";

const emptyDashboard = { products: [], monthlySales: [], dailySales: [], metrics: {}, granularity: "monthly", salesRecords: [], catalogRecords: [], orderRecords: [], databaseReady: false };

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: false }); if (denied) return denied;
  if (!isDatabaseConfigured()) return Response.json(emptyDashboard);
  try { return Response.json({ ...await dashboardData(requestUserId(request)), databaseReady: true }); }
  catch (error) { return Response.json({ error: "Could not load dashboard." }, { status: 500 }); }
}
