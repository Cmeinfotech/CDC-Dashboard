import { accessGuard } from "../../../../services/accessSecurity.mjs";
import { checkAmazonConnection, isAmazonConfigured } from "../../../../services/amazonSpApi";
import { getReportDefinitions, missingReportDefinitions } from "../../../../services/amazonReports";
import { monitorRoot, readJson } from '../../../../services/amazonMonitorStore.mjs';
import { join } from 'node:path';

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (!isAmazonConfigured()) return Response.json({ configured: false, connected: false, reportsConfigured: false, message: "Amazon SP-API credentials are not configured." });
  try {
    const definitions = getReportDefinitions();
    const automation = await readJson(join(monitorRoot(), 'automation.json'));
    return Response.json({ configured: true, connected: true, reportsConfigured: missingReportDefinitions().length === 0, definitions, automation, ...(await checkAmazonConnection()) });
  } catch (error) { return Response.json({ configured: true, connected: false, reportsConfigured: false, error: "Amazon connection failed." }, { status: 502 }); }
}
