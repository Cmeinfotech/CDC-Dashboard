import { accessGuard } from "../../../services/accessSecurity.mjs";
import { isDatabaseConfigured } from "../../../db";
import { requestUserId, trackingData } from "../../../services/backendService";

const emptyTracking = { products: [], monthlySales: [], dailySales: [], metrics: {}, childMetrics: {}, asinChanges: [], asinHistory: [], missingAsins: [], attributeChanges: [], salesRecords: [], catalogRecords: [], orderRecords: [], databaseReady: false };

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: false }); if (denied) return denied;
  if (!isDatabaseConfigured()) return Response.json(emptyTracking);
  try { return Response.json({ ...(await trackingData(requestUserId(request))), databaseReady: true }); }
  catch (error) { return Response.json({ error: "Could not load tracking data." }, { status: 500 }); }
}
