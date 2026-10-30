import { accessGuard, authenticatedUser } from "../../../../services/accessSecurity.mjs";
import { mergeAllChanges, requestUserId } from "../../../../services/backendService";

export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: false }); if (denied) return denied;
  try { const user = authenticatedUser(request); return Response.json(await mergeAllChanges(requestUserId(request), user.displayName || user.userId)); }
  catch (error) { return Response.json({ error: "Could not merge ASIN changes." }, { status: 500 }); }
}
