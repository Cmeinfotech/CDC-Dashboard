import { accessGuard } from "../../../services/accessSecurity.mjs";
import { isDatabaseConfigured } from "../../../db";
import { changeAuditHistory, requestUserId } from "../../../services/backendService";
import { monitorRoot, monitorState, readJson } from "../../../services/amazonMonitorStore.mjs";
import { join } from "node:path";

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: false });
  if (denied) return denied;
  try {
    const databaseReady = isDatabaseConfigured();
    const events = databaseReady ? await changeAuditHistory(requestUserId(request)) : [];
    if (request.headers.get("x-cdc-account-id") !== "nana-jewellers") {
      const monitor = await monitorState();
      for (const change of monitor.changes) for (const audit of change.audit || []) {
        const valueText = (value: unknown) => value == null ? "(empty)" : typeof value === "string" ? value : JSON.stringify(value);
        const parentAction = audit.action === "Merged" || audit.action === "Reversed";
        const before = parentAction ? (audit.previousParentAsins || []).join(", ") || "No parent" : valueText(audit.previous);
        const after = parentAction ? (audit.currentParentAsins || []).join(", ") || "No parent" : valueText(audit.current);
        events.push({
          id: `amazon:${change.id}:${audit.at}:${audit.action}`, userId: requestUserId(request), actor: audit.actor,
          action: audit.action === "Merged" ? "Amazon parent mapping merged" : audit.action === "Reversed" ? "Amazon parent mapping reversed" : `Amazon change ${String(audit.action).toLowerCase()}`,
          entityType: "amazon-parent-mapping", entityId: change.id,
          summary: parentAction ? `${change.title || change.sku || "Product"} (${change.asin}): ${before} → ${after}` : `${change.title || change.sku || "Product"} (${change.asin}) · ${audit.field || change.field || "Change"}: ${before} → ${after}`,
          details: { product: change.title || audit.title || change.sku, asin: change.asin || audit.asin, sku: change.sku || audit.sku, field: audit.field || change.field, previous: audit.previous, current: audit.current, previousParentAsins: audit.previousParentAsins, currentParentAsins: audit.currentParentAsins }, createdAt: audit.at,
        });
      }
      const productEdits = ((await readJson(join(monitorRoot(), "product-edits.json"))) || {}) as Record<string, any>;
      for (const [asin, record] of Object.entries(productEdits)) for (const audit of (record as any).audit || []) {
        events.push({
          id: `amazon:product-edit:${asin}:${audit.at}`, userId: requestUserId(request), actor: audit.actor,
          action: "Local product edit proposal saved", entityType: "amazon-product-edit", entityId: asin,
          summary: `${asin}: local title, description, or bullet-point proposal recorded · ${audit.reason}`,
          details: { asin, previous: audit.previous, current: audit.current, reason: audit.reason }, createdAt: audit.at,
        });
      }
    }
    events.sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return Response.json({ events: events.slice(0, 500), databaseReady }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return Response.json({ error: "Could not load change history." }, { status: 500 }); }
}
