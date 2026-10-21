import { accessGuard } from "../../../../services/accessSecurity.mjs";
import { mergeAllChanges, requestUserId } from "../../../../services/backendService";

export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: false }); if (denied) return denied;
  try { return Response.json(await mergeAllChanges(requestUserId(request))); }
  catch (error) { return Response.json({ error: "Could not merge ASIN changes." }, { status: 500 }); }
}
