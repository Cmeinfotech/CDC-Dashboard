"use client";

import { matchesPerformanceFilter, type PerformanceFilter } from "../utils/productPerformance";
import KpiCard from "./KpiCard";

type SummaryProduct = {
  parent: string; name: string; image?: string | null; sales: number; orders: number; units: number;
  growth: number | null; attentionReasons: string[]; stockReasons?: string[];
  lowOrderThreshold?: number;
};
export default function ProductPerformanceSummary({ products, filter, onFilter, catalogReady, catalogError, growthBucketLabel }: {
  products: SummaryProduct[]; filter: PerformanceFilter; onFilter: (value: PerformanceFilter) => void;
  catalogReady: boolean; catalogError: boolean; growthBucketLabel: string;
}) {
  const strongPerformerSales = Math.max(0, ...products.map(product => product.sales));
  const strongPerformer = products.reduce<SummaryProduct | undefined>(
    (top, product) => product.sales > (top?.sales ?? 0) ? product : top,
    undefined,
  );
  const strongPerformerLabel = strongPerformerSales > 0
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(strongPerformerSales)
    : "—";
  const cards = [
    { id: "all" as const, title: "Products" },
    { id: "attention" as const, title: "Low-performing products" },
    { id: "stock" as const, title: "Stock risk" },
    { id: "strong" as const, title: "Performing well" },
  ];
  return <section className="performance-discovery" aria-label="Product performance KPIs">
    <div className="performance-summary-kpis">{cards.map(({ id, title }) => {
      const needsCatalog = id !== "all";
      const unavailable = needsCatalog && !catalogReady;
      const countLabel = !catalogReady ? catalogError ? "Unavailable" : "Loading…" : products.filter(product => matchesPerformanceFilter(product, id)).length.toLocaleString("en-US");
      return <KpiCard key={id} title={title} count={countLabel} className={`tone-${id}`} selected={filter === id} disabled={needsCatalog && unavailable} onClick={() => onFilter(id)} />;
    })}<KpiCard title="Strong performer" count={strongPerformerLabel} subtitle={strongPerformer?.name || "Product title unavailable"} className="tone-strong" selected={filter === "strong"} disabled={!catalogReady} onClick={() => onFilter("strong")} /></div>
    {filter === "strong" && <p className="performance-summary-note">Sales growth compares the latest two displayed {growthBucketLabel} within the selected range: (latest period sales − previous period sales) ÷ previous period sales × 100. Growth needs a previous-period sales baseline.</p>}
    {catalogError && <p className="performance-summary-note" role="status">Stock and listing data could not be loaded. Reload to retry.</p>}
  </section>;
}
