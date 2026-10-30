import { accessGuard, authenticatedUser } from "../../../services/accessSecurity.mjs";
import { canCloseNotifications } from "../../../services/adminSecurity.mjs";
import { dismissNotification, dismissedNotifications } from "../../../services/amazonMonitorStore.mjs";

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true });
  if (denied) return denied;
  try {
    const user = authenticatedUser(request);
    return Response.json({ dismissed: await dismissedNotifications(), canClose: canCloseNotifications(user) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Notifications are unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: true });
  if (denied) return denied;
  const user = authenticatedUser(request);
  if (!canCloseNotifications(user)) return Response.json({ error: "Only leads can close notifications." }, { status: 403 });
  try {
    const body = await request.json();
    await dismissNotification(body?.id, user.displayName || user.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not close notification." }, { status: 400 });
  }
}
