import { accessGuard } from "../../../../services/accessSecurity.mjs";
import { atomicJson, monitorRoot, readJson } from "../../../../services/amazonMonitorStore.mjs";
import { join } from "node:path";
import { getAmazonReviewSnapshot } from "../../../../services/amazonReviewSnapshot.mjs";

const KEEPA_TIME_EPOCH_MINUTES = 21_564_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function historyPoints(values: unknown, divisor = 1) {
  if (!Array.isArray(values)) return [];
  const points: { date: string; value: number }[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    const keepaTime = Number(values[index]);
    const rawValue = Number(values[index + 1]);
    if (!Number.isFinite(keepaTime) || !Number.isFinite(rawValue) || keepaTime < 0 || rawValue < 0) continue;
    const date = new Date((keepaTime + KEEPA_TIME_EPOCH_MINUTES) * 60_000).toISOString().slice(0, 10);
    const value = rawValue / divisor;
    const previous = points.at(-1);
    if (previous?.date === date) previous.value = value;
    else points.push({ date, value });
  }
  return points;
}

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true });
  if (denied) return denied;
  if (request.headers.get("x-cdc-account-id") === "nana-jewellers") return Response.json({ error: "CDC only." }, { status: 403 });

  const asin = new URL(request.url).searchParams.get("asin")?.toUpperCase() || "";
  if (!/^[A-Z0-9]{10}$/.test(asin)) return Response.json({ error: "Enter a valid 10-character ASIN." }, { status: 400 });
  const apiKey = process.env.KEEPA_API_KEY?.trim();
  const file = join(monitorRoot(), "review-provider-keepa", `${asin}.json`);
  let cached: any = null;
  const savedResponse = (warning?: string) => Response.json({ ...cached, configured: Boolean(apiKey), cached: true, ...(warning ? { warning, stale: true } : {}) }, { headers: { "Cache-Control": "no-store" } });
  const amazonResponse = async () => {
    try { return Response.json(await getAmazonReviewSnapshot(asin), { headers: { "Cache-Control": "no-store" } }); }
    catch { return Response.json({ configured: true, asin, history: [], error: "Amazon customer ratings could not be retrieved right now. Please try again later." }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
  };
  try {
    cached = await readJson(file, null);
    if (cached?.asin !== asin || !Array.isArray(cached?.history)) cached = null;
    const age = cached?.fetchedAt ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
    if (cached && age >= 0 && age < CACHE_TTL_MS) return savedResponse();
    if (!apiKey) {
      if (cached) return savedResponse("Showing previously saved review data. Live updates are not connected.");
      return amazonResponse();
    }

    const query = new URLSearchParams({ key: apiKey, domain: "1", asin, history: "1", rating: "1" });
    const response = await fetch(`https://api.keepa.com/product?${query}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    const body: any = await response.json();
    if (!response.ok || body.error) {
      if (cached) return savedResponse("Showing previously saved review data because the latest update failed.");
      return amazonResponse();
    }
    const product = body.products?.find((item: any) => item.asin === asin);
    if (!product) return amazonResponse();

    const count = historyPoints(product.csv?.[17]);
    const rating = historyPoints(product.csv?.[16], 10);
    // Keepa CSV indexes: 0 Amazon price (US cents), 3 sales rank, 16 rating, 17 review count.
    const price = historyPoints(product.csv?.[0], 100);
    const salesRank = historyPoints(product.csv?.[3]);
    const byDate = new Map<string, { date: string; reviewCount: number | null; rating: number | null }>();
    for (const point of count) byDate.set(point.date, { date: point.date, reviewCount: point.value, rating: null });
    for (const point of rating) {
      const row = byDate.get(point.date) || { date: point.date, reviewCount: null, rating: null };
      row.rating = point.value;
      byDate.set(point.date, row);
    }
    const history = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
    const latestCount = [...count].at(-1)?.value ?? null;
    const latestRating = [...rating].at(-1)?.value ?? null;
    const categoryTree = Array.isArray(product.categoryTree) ? product.categoryTree : [];
    const categoryNames = new Map(categoryTree.map((category: any) => [String(category.catId), String(category.name || category.catId)]));
    const categoryRankHistory = Object.entries(product.salesRanks || {}).map(([categoryId, values]) => ({ categoryId, categoryName: categoryNames.get(categoryId) || `Category ${categoryId}`, history: historyPoints(values) })).filter((entry: any) => entry.history.length);
    const result = { configured: true, asin, history, priceHistory: price, salesRankHistory: salesRank, categoryRankHistory, current: { reviewCount: latestCount, rating: latestRating, price: price.at(-1)?.value ?? null, salesRank: salesRank.at(-1)?.value ?? null }, fetchedAt: new Date().toISOString(), source: "Keepa" };
    await atomicJson(file, result);
    return Response.json({ ...result, cached: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    if (cached) return savedResponse("Showing previously saved review data because the latest update failed.");
    return amazonResponse();
  }
}
