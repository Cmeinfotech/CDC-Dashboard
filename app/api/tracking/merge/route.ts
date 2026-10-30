import { accessGuard, authenticatedUser } from "../../../../services/accessSecurity.mjs";
import { mergeChange, requestUserId } from "../../../../services/backendService";
export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: false }); if (denied) return denied; try { const { id } = await request.json() as { id?: string }; if (!id) return Response.json({ error: "Change ID is required." }, { status: 400 }); const user = authenticatedUser(request); return Response.json(await mergeChange(requestUserId(request), id, user.displayName || user.userId)); } catch (error) { return Response.json({ error: "Could not merge ASIN." }, { status: 500 }); } }
