import { accessGuard, authenticatedUser } from "../../../../services/accessSecurity.mjs";
import { acquireLock, atomicJson, monitorRoot, readJson } from "../../../../services/amazonMonitorStore.mjs";
import { join } from "node:path";
import { boundedBytes } from "../../../../services/boundedBody.mjs";

const validAsin = (value: unknown): value is string => typeof value === "string" && /^[A-Z0-9]{10}$/.test(value);
const cleanFields = (value: any) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Enter product title, description, and bullet points.");
  const title = String(value.title ?? "").trim();
  const description = String(value.description ?? "").trim();
  const bullets = Array.isArray(value.bullets) ? value.bullets.map((item: unknown) => String(item ?? "").trim()).filter(Boolean) : [];
  if (title.length > 200 || description.length > 4000 || bullets.length > 5 || bullets.some((item: string) => item.length > 1000)) throw Error("Title, description, or bullet points exceed the allowed length.");
  return { title, description, bullets };
};
const file = () => join(monitorRoot(), "product-edits.json");

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get("x-cdc-account-id") === "nana-jewellers") return Response.json({ error: "CDC only." }, { status: 403 });
  const asin = new URL(request.url).searchParams.get("asin")?.toUpperCase() || "";
  if (!validAsin(asin)) return Response.json({ error: "Enter a valid 10-character ASIN." }, { status: 400 });
  try { const saved = ((await readJson(file())) || {}) as Record<string, any>; return Response.json({ asin, values: saved[asin]?.values || null, audit: saved[asin]?.audit || [] }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Local product edit history is unavailable." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  if (request.headers.get("x-cdc-account-id") === "nana-jewellers") return Response.json({ error: "CDC only." }, { status: 403 });
  const user = authenticatedUser(request);
  try {
    const bytes = await boundedBytes(request, 16 * 1024);
    const body = JSON.parse(Buffer.from(bytes).toString("utf8"));
    const asin = typeof body?.asin === "string" ? body.asin.toUpperCase() : "";
    if (!validAsin(asin)) return Response.json({ error: "Enter a valid 10-character ASIN." }, { status: 400 });
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!reason || reason.length > 1000) return Response.json({ error: "Enter a reason (1–1000 characters) for this product edit." }, { status: 400 });
    const values = cleanFields(body.values);
    const release = await acquireLock("product-edits");
    try {
      const all = ((await readJson(file())) || {}) as Record<string, any>;
      const prior = all[asin] || { values: null, audit: [] };
      const at = new Date().toISOString();
      const event = { actor: user.displayName || user.userId, at, reason, previous: prior.values, current: values };
      all[asin] = { values, audit: [...(prior.audit || []), event].slice(-500) };
      await atomicJson(file(), all);
      return Response.json({ asin, values, audit: all[asin].audit }, { headers: { "Cache-Control": "no-store" } });
    } finally { await release(); }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not save local product edit." }, { status: 400 }); }
}
