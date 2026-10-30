"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Boxes, ChevronLeft, ChevronRight, CircleDollarSign, Package, RefreshCw, ShieldCheck, X } from "lucide-react";
import { getAmazonMonitorData } from "../services/dashboardService";

type Category = "Product" | "Price" | "Stock" | "Account health";
type Notice = { id: string; category: Category; title: string; detail: string; at: string; severity: string; href: string };
type LoadState = { notices: Notice[]; unavailable: string[]; dismissed: Record<string, { actor: string; at: string }>; canClose: boolean; riskCoverDays: number };
const categoryIcon = { Product: Boxes, Price: CircleDollarSign, Stock: Package, "Account health": ShieldCheck };
const categoryHref = { Product: "/?page=tracking", Price: "/?page=tracking", Stock: "/?page=tracking", "Account health": "/?page=accountHealth" };
const printable = (value: unknown) => value == null || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
const isBadMetric = (value: any) => String(value?.status || "").toUpperCase() === "BAD" || Number(value?.defectsCount || 0) > 0 || Number(value?.warningsCount || 0) > 0;

export function useDashboardNotifications() {
  const [state, setState] = useState<LoadState | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Category | "All">("All");
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [closingId, setClosingId] = useState("");
  const [closeError, setCloseError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [monitorResult, healthResult, catalogResult, notificationResult] = await Promise.allSettled([
      getAmazonMonitorData(),
      fetch("/api/amazon/account-health", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error || "Account health unavailable."); return body; }),
      fetch("/api/amazon/tracking-catalog", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error || "Product and inventory data unavailable."); return body; }),
      fetch("/api/notifications", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error || "Notification permissions unavailable."); return body; }),
    ]);
    if (monitorResult.status === "rejected" && healthResult.status === "rejected" && catalogResult.status === "rejected") {
      setError("Notifications could not be loaded. Check the Amazon connection and retry."); setState(null); setLoading(false); return;
    }
    const notices: Notice[] = [];
    const unavailable: string[] = [];
    if (monitorResult.status === "fulfilled") {
      const changes = monitorResult.value?.changes || [];
      for (const change of changes) {
        const field = String(change.field || "");
        const category: Category = field === "listing.price" ? "Price" : field === "listing.quantity" || field === "listing.status" ? "Stock" : "Product";
        const label = field.replace(/^listing\./, "").replace(/^attributes\./, "").replace(/[._]/g, " ");
        notices.push({ id: `change-${change.id}`, category, title: `${category} change · ${label}`, detail: `${change.title || change.asin || change.sku || "Product"} (${change.asin || change.sku || "—"}): ${printable(change.previous)} → ${printable(change.current)}`, at: change.detectedAt, severity: change.priority || "Info", href: categoryHref[category] });
      }
    } else unavailable.push("Product, price, and stock changes");
    if (healthResult.status === "fulfilled") {
      const data = healthResult.value?.data;
      const metrics = data?.performanceMetrics?.find((entry: any) => entry.marketplaceId === data.marketplaceId)?.metrics || [];
      for (const metric of metrics) {
        const values = metric.category === "orderDefectRate" && metric.value && !Array.isArray(metric.value)
          ? Object.entries(metric.value).map(([name, value]) => ({ ...(value as object), _label: name }))
          : Array.isArray(metric.value) ? metric.value : [metric.value];
        values.forEach((value: any, index: number) => {
          if (!isBadMetric(value)) return;
          const name = metric.category === "orderDefectRate" ? `${metric.category} ${value?._label || (index === 0 ? "FBA" : "FBM")}` : metric.category;
          const healthId = `health-${String(data.capturedAt || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_")}-${String(name).replace(/[^a-zA-Z0-9_-]/g, "_")}-${index}`;
          notices.push({ id: healthId, category: "Account health", title: `Account health · ${name.replace(/([a-z])([A-Z])/g, "$1 $2")}`, detail: `Amazon reported status ${value?.status || "with flagged counts"}${value?.defectsCount ? ` · ${value.defectsCount} defects` : ""}${value?.warningsCount ? ` · ${value.warningsCount} warnings` : ""}. Review the saved Account Health report.`, at: data.capturedAt, severity: "Warning", href: categoryHref["Account health"] });
        });
      }
    } else unavailable.push("Account health alerts");
    if (catalogResult.status === "fulfilled") {
      const catalog = catalogResult.value;
      const threshold = Number(catalog.stockRiskCoverDays) || 7;
      for (const product of catalog.products || []) {
        if (product.fulfillment !== "AMAZON_NA" || !product.fbaStock) continue;
        const sellable = Number(product.fbaStock.sellable);
        const units = Number(product.recent30DayUnits || 0);
        const daysCover = units > 0 ? sellable / (units / 30) : Infinity;
        const item = `${product.title || product.asin} (${product.asin}${product.sku ? ` · ${product.sku}` : ""})`;
        const safe = `${product.asin}-${String(product.sku || "listing").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48)}`;
        if (sellable <= 0) notices.push({ id: `stock-out-${safe}-${sellable}`, category: "Stock", title: "FBA listing is out of stock", detail: `${item}: latest saved inventory shows ${sellable} sellable units. Review the inventory pull before replenishing.`, at: catalog.inventoryPulledAt || catalog.capturedAt, severity: "Critical", href: "/?page=productCatalog" });
        else if (Number.isFinite(daysCover) && units > 0 && daysCover <= threshold) notices.push({ id: `stock-risk-${safe}-${sellable}-${Math.ceil(daysCover)}`, category: "Stock", title: "FBA stock may run out soon", detail: `${item}: ${sellable} sellable units, about ${daysCover.toFixed(1)} days of cover at the last-30-day order rate (threshold ${threshold} days).`, at: catalog.inventoryPulledAt || catalog.capturedAt, severity: "Warning", href: "/?page=productCatalog" });
        if (catalog.salesSource?.dormantCoverageAvailable && (!product.lastSaleDate || product.lastSaleDate <= catalog.salesSource.dormantSince)) notices.push({ id: `dormant-${safe}-${product.lastSaleDate || "none"}`, category: "Product", title: "Listing has no order in 90 days", detail: `${item}: complete saved dated-order coverage shows no sale since ${product.lastSaleDate || "the start of the available history"}. Check listing status and demand.`, at: catalog.salesSource.pulledAt || catalog.capturedAt, severity: "Warning", href: "/?page=productCatalog" });
      }
    } else unavailable.push("Product stock and 90-day listing signals");
    const dismissed = notificationResult.status === "fulfilled" ? notificationResult.value.dismissed || {} : {};
    if (notificationResult.status === "rejected") unavailable.push("Lead-only close controls");
    notices.sort((a, b) => Date.parse(b.at || "") - Date.parse(a.at || ""));
    const riskCoverDays = catalogResult.status === "fulfilled" ? Number(catalogResult.value.stockRiskCoverDays) || 7 : 7;
    setState({ notices: notices.filter(notice => !dismissed[notice.id]).slice(0, 300), unavailable, dismissed, canClose: notificationResult.status === "fulfilled" && notificationResult.value.canClose === true, riskCoverDays }); setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  const visible = useMemo(() => filter === "All" ? state?.notices || [] : (state?.notices || []).filter(notice => notice.category === filter), [filter, state]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(currentPage, pageCount);
  const pageRows = visible.slice((page - 1) * pageSize, page * pageSize);
  const closeNotice = async (id: string) => {
    setClosingId(id); setCloseError("");
    try {
      const response = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Could not close notification.");
      setState(current => current ? { ...current, notices: current.notices.filter(notice => notice.id !== id), dismissed: { ...current.dismissed, [id]: { actor: "You", at: new Date().toISOString() } } } : current);
    } catch (error) { setCloseError(error instanceof Error ? error.message : "Could not close notification."); }
    finally { setClosingId(""); }
  };
  return { state, error, filter, setFilter, loading, currentPage, setCurrentPage, closingId, closeError, load, visible, pageSize, pageCount, page, pageRows, closeNotice };
}

export default function DashboardNotifications({ model }: { model: ReturnType<typeof useDashboardNotifications> }) {
  const { state, error, filter, setFilter, loading, setCurrentPage, closingId, closeError, load, visible, pageSize, pageCount, page, pageRows, closeNotice } = model;
  const categories: (Category | "All")[] = ["All", "Product", "Price", "Stock", "Account health"];
  return <section className="notifications-page" aria-label="Dashboard notifications">
    <div className="notifications-toolbar"><div className="notifications-count"><Bell size={17}/><strong>{state?.notices.length || 0}</strong><span>alerts</span></div><button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh"}</button></div>
    {error && <div className="card" role="alert"><p>{error}</p><button className="secondary" onClick={() => void load()}>Retry</button></div>}
    {closeError && <p className="notification-action-error" role="alert">{closeError}</p>}
    {state?.unavailable.length ? <p className="notifications-note" role="status">Some sources could not be checked: {state.unavailable.join(", ")}.</p> : null}
    <div className="notifications-filters" role="group" aria-label="Filter notifications">{categories.map(category => <button type="button" key={category} className={filter === category ? "active" : ""} onClick={() => { setFilter(category); setCurrentPage(1); }}>{category}{category === "All" ? ` (${state?.notices.length || 0})` : ` (${state?.notices.filter(item => item.category === category).length || 0})`}</button>)}</div>
    {loading && !state ? <div className="card">Loading notifications…</div> : visible.length ? <><div className="notifications-list">{pageRows.map(notice => { const Icon = categoryIcon[notice.category]; return <article className="notification-row" key={notice.id}><div className={`notification-category-icon notification-${notice.category.toLowerCase().replace(/\s/g, "-")}`}><Icon size={17}/></div><div className="notification-copy"><div className="notification-title-line"><strong>{notice.title}</strong><span className={`notification-severity ${notice.severity.toLowerCase()}`}>{notice.severity}</span></div><p>{notice.detail}</p><small>{notice.at ? new Date(notice.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Time not provided"}</small></div><a href={notice.href}>View details <Activity size={14}/></a>{state?.canClose && <button type="button" className="notification-close" title="Close notification" aria-label={`Close ${notice.title}`} disabled={closingId === notice.id} onClick={() => void closeNotice(notice.id)}>{closingId === notice.id ? "Closing…" : <><X size={14}/> Close</>}</button>}</article>; })}</div><div className="app-pagination notification-pagination"><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, visible.length)} of {visible.length} alerts</span><div className="pagination-actions"><span>Page {page} of {pageCount}</span><div className="page-controls"><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setCurrentPage(page - 1)}><ChevronLeft size={15}/></button><button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setCurrentPage(page + 1)}><ChevronRight size={15}/></button></div></div></div></> : !error && <div className="notifications-empty"><div><Bell size={22}/></div><strong>{state?.notices.length ? "No alerts in this category" : "You’re all caught up"}</strong><p>New product, price, stock, and account-health alerts will appear here when Amazon data reports a change or a flagged metric.</p></div>}
    {state && !state.canClose && <p className="notifications-note">Only dashboard leads can close notifications.</p>}
    <p className="notifications-note"><AlertTriangle size={14}/> Product, price and listing-change alerts are based on saved Amazon pulls. FBA low-stock alerts use a {state?.riskCoverDays || 7}-day cover threshold and the last 30 days of dated orders; dormant-listing alerts require complete 90-day order coverage.</p>
  </section>;
}
