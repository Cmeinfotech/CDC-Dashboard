type Listing = {
  asin: string;
  sku?: string;
  parentAsins?: string[];
  parentage?: string;
  status?: string | string[] | null;
  fulfillment?: string;
  quantity?: string | number | null;
  fbaStock?: { sellable: number } | null;
  recent30DayUnits?: number;
  lastSaleDate?: string | null;
};
export type PerformanceCatalog = {
  products?: Listing[];
  stockRiskCoverDays?: number;
  salesSource?: { dormantCoverageAvailable?: boolean; dormantSince?: string };
  performance30Days?: {
    start: string; end: string; previousStart: string; previousEnd: string; completeCoverage: boolean; growthCoverage: boolean; lowOrderThreshold: number;
    byAsin: Record<string, { orders: number | null; units: number; salesByCurrency: Record<string, number> | null; previousOrders: number | null; previousSalesByCurrency: Record<string, number> | null; lastSaleDate: string | null }>;
  };
};

export type PerformanceFilter = "all" | "attention" | "stock" | "strong";
export function isStrongPerformer(product: { sales: number; orders: number; lowOrderThreshold?: number }) {
  return product.sales > 0 && product.orders > (product.lowOrderThreshold ?? 5);
}

export function matchesPerformanceFilter(product: { sales: number; orders: number; growth: number | null; attentionReasons: string[]; stockReasons?: string[]; lowOrderThreshold?: number }, filter: PerformanceFilter) {
  if (filter === "attention") return product.attentionReasons.length > 0;
  if (filter === "stock") return (product.stockReasons || []).length > 0;
  if (filter === "strong") return isStrongPerformer(product);
  return true;
}

export function productAttentionReasons(listing: Listing): string[] {
  const reasons: string[] = [];
  const status = Array.isArray(listing.status) ? listing.status.join(" ") : String(listing.status || "");
  if (/\b(INACTIVE|INCOMPLETE|SUPPRESSED|INACTIVE_OUT_OF_STOCK)\b/i.test(status)) reasons.push("Inactive / incomplete listing");
  return reasons;
}

export function productStockReasons(listing: Listing, catalog: PerformanceCatalog): string[] {
  const reasons: string[] = [];
  const rawStock = listing.fulfillment === "AMAZON_NA" ? listing.fbaStock?.sellable : listing.fulfillment === "DEFAULT" ? listing.quantity : null;
  const stock = rawStock == null || rawStock === "" ? null : Number(rawStock);
  if (stock != null && Number.isFinite(stock) && stock >= 0) {
    const dailyUnits = Number(listing.recent30DayUnits || 0) / 30;
    if (stock === 0) reasons.push("Out of stock");
    else if (stock <= 5 || (dailyUnits > 0 && stock / dailyUnits <= (catalog.stockRiskCoverDays || 7))) reasons.push("Low stock");
  }
  return reasons;
}

export function productPerformanceDetails(parent: string, children: string[], catalog: PerformanceCatalog | null) {
  const ids = new Set([parent, ...children]);
  const matched = (catalog?.products || []).filter(listing => ids.has(listing.asin) || listing.parentAsins?.includes(parent));
  // Non-buyable parent placeholder listings must not make every family incomplete.
  const listings = matched.filter(listing => listing.parentage?.toLowerCase() !== "parent");
  const stockReasons = [...new Set(listings.flatMap(listing => productStockReasons(listing, catalog!)))];
  const reasons = [...new Set(listings.flatMap(listing => productAttentionReasons(listing)))];
  const period = catalog?.performance30Days;
  const metric = period?.byAsin[parent];
  const coverage = Boolean(period?.completeCoverage && listings.length);
  const orders = coverage ? metric ? metric.orders : 0 : null;
  const salesByCurrency = coverage ? metric ? metric.salesByCurrency : {} : null;
  const statuses = new Map<string, number>();
  for (const listing of listings) {
    const status = Array.isArray(listing.status) ? listing.status.join(", ") : listing.status;
    if (status) statuses.set(status, (statuses.get(status) || 0) + 1);
  }
  const lastSaleDate = metric?.lastSaleDate || listings.map(listing => listing.lastSaleDate).filter((date): date is string => Boolean(date)).sort().at(-1) || null;
  return {
    attentionReasons: reasons, stockReasons, recent30DayCoverage: coverage, recent30DayOrders: orders, recent30DaySales: salesByCurrency, lastSaleDate,
    listingStatus: [...statuses].map(([status, count]) => `${status}${listings.length > 1 ? ` (${count})` : ""}`).join(" · ") || "Not returned",
    focusAction: reasons.includes("Inactive / incomplete listing") ? "Fix listing" : reasons.length ? "Improve product sales" : "—",
  };
}
