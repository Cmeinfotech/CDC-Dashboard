import { accessGuard, authenticatedUser } from "../../../../services/accessSecurity.mjs";
import { canManageDashboardUsers } from "../../../../services/adminSecurity.mjs";
import { createDashboardUser, dashboardUserList, passwordLoginConfigured } from "../../../../services/dashboardPasswordAuth.mjs";
import { boundedBytes } from "../../../../services/boundedBody.mjs";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const denied = accessGuard(request);
  if (denied) return denied;
  const user = authenticatedUser(request);
  if (!canManageDashboardUsers(user)) return Response.json({ error: "Only the dashboard administrator can manage users." }, { status: 403, headers });
  if (!passwordLoginConfigured()) return Response.json({ error: "In-dashboard user creation requires dashboard password login to be configured." }, { status: 503, headers });
  try {
    return Response.json({ users: dashboardUserList(), canCreate: true, canManage: true }, { headers });
  } catch {
    return Response.json({ error: "User list is unavailable." }, { status: 500, headers });
  }
}

export async function POST(request: Request) {
  const denied = accessGuard(request);
  if (denied) return denied;
  const user = authenticatedUser(request);
  if (!canManageDashboardUsers(user)) return Response.json({ error: "Only the dashboard administrator can create users." }, { status: 403, headers });
  if (!passwordLoginConfigured()) return Response.json({ error: "User creation requires dashboard password login to be configured." }, { status: 503, headers });
  try {
    const bytes = await boundedBytes(request, 8192);
    const input = JSON.parse(Buffer.from(bytes).toString("utf8"));
    const created = createDashboardUser(input);
    return Response.json({ ok: true, user: created }, { status: 201, headers });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not create user." }, { status: 400, headers });
  }
}
