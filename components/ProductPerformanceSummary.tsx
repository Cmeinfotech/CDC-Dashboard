"use client";

import { AlertTriangle, Boxes, TrendingUp } from "lucide-react";
import { matchesPerformanceFilter, type PerformanceFilter } from "../utils/productPerformance";

type SummaryProduct = {
  parent: string; name: string; image?: string | null; sales: number; orders: number; units: number;
  growth: number | null; attentionReasons: string[]; stockReasons?: string[];
  lowOrderThreshold?: number;
};
export default function ProductPerformanceSummary({ products, filter, onFilter, catalogReady, catalogError, lowOrderThreshold, dateRangeLabel, growthBucketLabel }: {
  products: SummaryProduct[]; filter: PerformanceFilter; onFilter: (value: PerformanceFilter) => void;
  catalogReady: boolean; catalogError: boolean; lowOrderThreshold: number; dateRangeLabel: string; growthBucketLabel: string;
}) {
  const cards = [
    { id: "all" as const, title: "Products", icon: Boxes, note: "All products in the selected scope" },
    { id: "attention" as const, title: "Low-performing products", icon: AlertTriangle, note: `No sales / up to ${lowOrderThreshold} orders in selected range, or listing issues` },
    { id: "stock" as const, title: "Stock risk", icon: Boxes, note: "Low stock or already out of stock" },
    { id: "strong" as const, title: "Performing well", icon: TrendingUp, note: `Positive sales and more than ${lowOrderThreshold} orders in selected range` },
  ];
  return <section className="performance-discovery" aria-label="Product performance KPIs">
    <div className="performance-summary-kpis">{cards.map(({ id, title, icon: Icon, note }) => {
      const needsCatalog = id !== "all";
      const unavailable = needsCatalog && !catalogReady;
      const countLabel = !catalogReady ? catalogError ? "Unavailable" : "Loading…" : products.filter(product => matchesPerformanceFilter(product, id)).length.toLocaleString("en-US");
      return <button key={id} type="button" className={`performance-summary-kpi tone-${id} ${filter === id ? "is-active" : ""}`} aria-pressed={filter === id} disabled={needsCatalog && !catalogReady} onClick={() => onFilter(id)}>
        <Icon size={21} aria-hidden="true" /><span><b>{title}</b><strong>{unavailable ? countLabel : products.filter(product => matchesPerformanceFilter(product, id)).length.toLocaleString("en-US")}</strong><small>{note}</small></span>
      </button>;
    })}</div>
    <p className="performance-summary-note">{filter === "attention" ? `Focus on products with no sales, ${lowOrderThreshold} or fewer orders in ${dateRangeLabel}, or incomplete / inactive listings. Stock risk is counted separately.` : filter === "stock" ? `Latest stock: 5 or fewer units, out of stock, or short stock cover. Sales and order metrics use ${dateRangeLabel}.` : filter === "strong" ? `Requires positive sales and more than ${lowOrderThreshold} orders in ${dateRangeLabel}. Listing status does not exclude a product; incomplete / inactive status remains visible in the table.` : `Sales and order results use the selected date range: ${dateRangeLabel}. Listing and stock status are current snapshots.`}</p>
    {filter === "strong" && <p className="performance-summary-note">Sales growth compares the latest two displayed {growthBucketLabel} within the selected range: (latest period sales − previous period sales) ÷ previous period sales × 100. Growth needs a previous-period sales baseline.</p>}
    {catalogError && <p className="performance-summary-note" role="status">Stock and listing data could not be loaded. Reload to retry.</p>}
  </section>;
}
