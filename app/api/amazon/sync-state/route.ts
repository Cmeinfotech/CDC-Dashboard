import { accessGuard } from "../../../../services/accessSecurity.mjs";
import { loadAmazonSyncStatus } from "../../../../services/amazonSyncStatus.mjs";

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true });
  if (denied) return denied;
  if (request.headers.get("x-cdc-account-id") === "nana-jewellers") {
    return Response.json({ error: "CDC only." }, { status: 403 });
  }
  try { return Response.json(await loadAmazonSyncStatus(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Amazon sync status unavailable." }, { status: 500 }); }
}
