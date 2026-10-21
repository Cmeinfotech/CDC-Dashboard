import { isMainAdmin, adminConfigured } from '../../../../services/adminSecurity.mjs';
import { accessGuard, authenticatedUser } from "../../../../services/accessSecurity.mjs";
import { monitorState, reviewChange, reviewChanges } from "../../../../services/amazonMonitorStore.mjs";
export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get("x-cdc-account-id") === "nana-jewellers") return Response.json({ error: "CDC only." }, { status: 403 });
  try {
    const state = await monitorState();
    const user = authenticatedUser(request);
    const { dashboardRun, ...publicState } = state;
    return Response.json({ ...publicState, permissions: { isMainAdmin: isMainAdmin(user), canReverse: isMainAdmin(user) && adminConfigured(), adminConfigured: adminConfigured() }, run: state.run ? { id: state.run.id, capturedAt: state.run.capturedAt, sourceCapturedAt: state.run.sourceCapturedAt, marketplaceId: state.run.marketplaceId, source: state.run.source, baseline: state.run.baseline, unavailableDetails: state.run.unavailableDetails, productCount: state.run.products.length,
      products: (dashboardRun || state.run).products.map((p: any) => ({ sku: p.sku, asin: p.asin, title: p.title, image: p.images?.find((i: any)=>i.variant === 'MAIN')?.link || p.images?.[0]?.link || null, parentage: p.parentage, parentAsins: p.parentAsins, childCount: p.childAsins.length, detailsAvailable: p.detailsAvailable, status: p.listing.status })) } : null,
      capabilities: { reviews: "Review counts, ratings and review redistribution are not returned by the configured product APIs and are not monitored.", attribution: "Detection time is shown. The API does not identify who changed a product." },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return Response.json({ error: "History unavailable." }, { status: 500 }); }
}
export async function PATCH(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get("x-cdc-account-id") === "nana-jewellers") return Response.json({ error: "CDC only." }, { status: 403 });
  try { const body = await request.json(); const user = authenticatedUser(request);
    if (Array.isArray(body.ids)) { await reviewChanges(body.ids, body.status, user.userId); return Response.json({ ok: true, reviewed: body.ids.length }); }
    if (typeof body.id !== "string" || !/^[a-f0-9]{64}$/.test(body.id)) return Response.json({ error: "Invalid change ID." }, { status: 400 }); await reviewChange(body.id, body.status, user.userId); return Response.json({ ok: true }); }
  catch (e) { return Response.json({ error: "Review failed." }, { status: 400 }); }
}
