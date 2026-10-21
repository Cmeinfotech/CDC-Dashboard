import { join } from 'node:path';
import { accessGuard } from '../../../../services/accessSecurity.mjs';
import { monitorState } from '../../../../services/amazonMonitorStore.mjs';
import { readAmazonJson } from '../../../../services/amazonDataSecurity.mjs';
import { catalogProducts } from '../../../../services/amazonTrackingCatalog.mjs';
export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get('x-cdc-account-id') === 'nana-jewellers') return Response.json({error:'CDC only.'}, {status:403});
  try {
    const [state, report] = await Promise.all([monitorState(), readAmazonJson(join(process.cwd(),'outputs','amazon-cdc','order-report.json'))]);
    const dates = (report?.rows || []).filter((r: any) => r['sales-channel'] === 'Amazon.com').map((r: any) => r['purchase-date']).filter(Boolean).sort();
    return Response.json({ capturedAt: state.run?.capturedAt || null, products: catalogProducts(state.dashboardRun?.products || [], report?.rows || []), salesSource: { available: Boolean(report?.rows?.length), pulledAt: report?.pulledAt || null, start: dates[0] || null, end: dates.at(-1) || null } }, {headers:{'Cache-Control':'no-store'}});
  } catch { return Response.json({error:'Saved Amazon catalog could not be loaded.'}, {status:500}); }
}
