import { accessGuard } from "../../../../services/accessSecurity.mjs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { isAmazonConfigured } from "../../../../services/amazonSpApi";
import { monitorState } from "../../../../services/amazonMonitorStore.mjs";
import { assertAmazonStorage } from '../../../../services/amazonDataSecurity.mjs';
export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get("x-cdc-account-id") === "nana-jewellers") return Response.json({ error: "CDC only." }, { status: 403 });
  if (!isAmazonConfigured()) return Response.json({ error: "Amazon credentials are not configured." }, { status: 503 });
  try {
    assertAmazonStorage();
    const state = await monitorState();
    if (state.progress?.running) return Response.json({ status: "running" }, { status: 202 });
    const previousStart = Date.parse(state.progress?.startedAt || state.run?.startedAt || '');
    if (Number.isFinite(previousStart) && Date.now() - previousStart < 60000) return Response.json({ error: 'Wait before starting another Amazon sync.' }, { status: 429, headers: { 'Retry-After': '60' } });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [join(process.cwd(), "scripts", "amazon-daily-sync.mjs"), "--now"], { cwd: process.cwd(), env: process.env, detached: true, windowsHide: true, stdio: "ignore" });
      child.once("error", reject); child.once("spawn", () => { child.unref(); resolve(); });
    });
    return Response.json({ status: "starting", message: "Catalog, listings, and Account Health are refreshing. Follow progress in Amazon Change Monitor." }, { status: 202 });
  } catch (e) { return Response.json({ error: "Sync failed to start." }, { status: 500 }); }
}
