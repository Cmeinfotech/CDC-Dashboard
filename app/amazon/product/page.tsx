"use client";

import { useEffect, useState } from "react";
import ProductSalesChart, { type ProductSalesPoint } from "../../../components/ProductSalesChart";
import { GlobalDateRangeFilter, useGlobalDateRange } from "../../../components/GlobalDateRange";

type Field = { key: string; label: string; value: string };
type Listing = { sku: string; price: string | null; quantity: string | null; fulfillment: string | null; status: string | null };
type Product = {
  asin: string; title: string; brand: string;
  images: { variant: string; link: string; width: number; height: number }[];
  sections: { title: string; fields: Field[] }[];
  pulledAt: string | null; listings: Listing[];
};
type CatalogListing = Listing & {
  asin: string; parentAsins: string[];
  fbaStock: { total: number; sellable: number; reserved: number; unsellable: number } | null;
  sales: { currency: string; amount: number; units: number | null; months: Record<string, number> }[];
};
type DashboardSalesRecord = { childAsin?: string; asin?: string; parentAsin?: string; month?: string; date?: string; sales?: number; currency?: string };
const clean = (value: string) => value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const shown = (value: string | number | null | undefined) => value === "" || value == null ? "—" : value;
const fulfillmentName = (value: string | null | undefined) => value === "DEFAULT" ? "FBM" : value === "AMAZON_NA" ? "FBA" : shown(value);
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
const monthKey = (value: string | undefined) => {
  const text = String(value || "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(text)) return text.slice(0, 7);
  const match = text.match(/^([a-z]{3,9})\.?\s+(20\d{2})$/i);
  const month = match ? ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[1].slice(0, 3).toLowerCase()) : -1;
  return match && month >= 0 ? `${match[2]}-${String(month + 1).padStart(2, "0")}` : "";
};

export default function AmazonProductPage() {
  const { startDate, endDate } = useGlobalDateRange();
  const rangeActive = Boolean(startDate && endDate && startDate <= endDate);
  const [selection, setSelection] = useState({ asin: "", sku: "" });
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [catalog, setCatalog] = useState<CatalogListing[]>([]);
  const [dashboardSalesRecords, setDashboardSalesRecords] = useState<DashboardSalesRecord[]>([]);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const requested = { asin: (params.get("asin") || "").trim().toUpperCase(), sku: params.get("sku") || "" };
    const load = async () => {
      if (!/^[A-Z0-9]{10}$/.test(requested.asin)) throw Error("Open a product from the catalogue using a valid ASIN.");
      const response = await fetch(`/api/amazon/product?asin=${encodeURIComponent(requested.asin)}`, { signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw Error(body.error || "Product details could not be loaded.");
      if (!controller.signal.aborted) { setSelection(requested); setProduct(body); }
    };
    void load().catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard", { cache: "no-store", headers: { "x-cdc-account-id": "cdc" }, signal: controller.signal })
      .then(async response => { if (!response.ok) return null; return response.json(); })
      .then(body => { if (!controller.signal.aborted && Array.isArray(body?.salesRecords)) setDashboardSalesRecords(body.salesRecords); })
      .catch(() => { /* Product catalog sales remain available if dashboard history cannot be loaded. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/amazon/tracking-catalog", { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw Error("Sales and inventory could not be loaded."); return body; })
      .then(body => { if (!controller.signal.aborted) setCatalog(body.products || []); })
      .catch(cause => { if (!controller.signal.aborted) setCatalogError(cause.message); });
    return () => controller.abort();
  }, []);

  const related = catalog.filter(item => item.asin === selection.asin || item.parentAsins?.includes(selection.asin));
  const selected = related.find(item => item.sku === selection.sku) || related.find(item => item.asin === selection.asin);
  const listing = selected || product?.listings.find(item => item.sku === selection.sku) || product?.listings[0];
  // Show the selected SKU's sales; a parent ASIN without a selected SKU uses its related listings.
  const salesListings = selection.sku ? related.filter(item => item.sku === selection.sku) : related;
  // The default period is portfolio-wide so it remains visible even when the selected ASIN has no sales.
  const availableMonths = [...new Set(catalog.flatMap(item => (item.sales || []).flatMap(sale => Object.keys(sale.months || {}))).filter(month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month)))].sort();
  const lastAvailableMonth = availableMonths.at(-1);
  const monthEnd = lastAvailableMonth ? new Date(`${lastAvailableMonth}-01T00:00:00Z`) : null;
  if (monthEnd) monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  const defaultRange = availableMonths.length ? { startDate: `${availableMonths[0]}-01`, endDate: monthEnd!.toISOString().slice(0, 10) } : undefined;
  const sales = new Map<string, { currency: string; amount: number; units: number | null; months: Record<string, number> }>();
  for (const item of salesListings) for (const sale of item.sales || []) {
    const total = sales.get(sale.currency) || { currency: sale.currency, amount: 0, units: rangeActive ? null : 0, months: {} };
    if (!rangeActive) {
      total.amount += sale.amount || 0;
      total.units = total.units != null && sale.units != null ? total.units + sale.units : null;
    }
    for (const [month, amount] of Object.entries(sale.months || {})) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) continue;
      const first = `${month}-01`;
      const last = new Date(`${first}T00:00:00Z`);
      last.setUTCMonth(last.getUTCMonth() + 1, 0);
      if (rangeActive && (first > endDate || last.toISOString().slice(0, 10) < startDate)) continue;
      total.months[month] = (total.months[month] || 0) + amount;
      if (rangeActive) total.amount += amount;
    }
    sales.set(sale.currency, total);
  }
  const totals = [...sales.values()];
  const months = totals.flatMap(sale => Object.entries(sale.months).map(([month, amount]) => ({ month, currency: sale.currency, amount }))).sort((a, b) => b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency));
  const productAsins = new Set([selection.asin, ...related.map(item => item.asin)].map(asin => asin.toUpperCase()).filter(Boolean));
  const matchingDashboardSales = dashboardSalesRecords.filter(row => productAsins.has(String(row.childAsin || row.asin || "").toUpperCase()));
  const chartSales = new Map<string, ProductSalesPoint>();
  for (const row of matchingDashboardSales) {
    const month = monthKey(row.month || row.date);
    const amount = Number(row.sales);
    if (!month || !Number.isFinite(amount)) continue;
    const first = `${month}-01`;
    const lastDate = new Date(`${first}T00:00:00Z`);
    lastDate.setUTCMonth(lastDate.getUTCMonth() + 1, 0);
    if (rangeActive && (first > endDate || lastDate.toISOString().slice(0, 10) < startDate)) continue;
    const currency = row.currency || "USD";
    const key = `${month}\u001f${currency}`;
    const point = chartSales.get(key) || { month, currency, sales: 0 };
    point.sales += amount;
    chartSales.set(key, point);
  }
  const productSalesPoints = chartSales.size ? [...chartSales.values()].sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency)) : months.map(row => ({ month: row.month, currency: row.currency, sales: row.amount })).sort((a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency));
  const specificationColumns: { title: string; fields: Field[] }[][] = [[], []];
  const specificationWeights = [0, 0];
  const specificationSections = (product?.sections.filter(section => section.fields.length > 0) || []).sort((left, right) => right.fields.length - left.fields.length);
  for (const section of specificationSections) {
    const column = specificationWeights[0] <= specificationWeights[1] ? 0 : 1;
    specificationColumns[column].push(section);
    specificationWeights[column] += section.fields.length + 1;
  }
  const inventory = selected?.fbaStock;
  const overview = [
    ["ASIN", product?.asin], ["SKU", listing?.sku || selection.sku], ["Brand", product?.brand],
    ["Listing status", listing?.status], ["Listing price", listing?.price], ["Fulfillment", fulfillmentName(listing?.fulfillment)],
    ["Sellable stock", inventory ? inventory.sellable : listing?.fulfillment === "DEFAULT" ? listing.quantity : null],
    ...(inventory ? [["Total FBA stock", inventory.total], ["Reserved", inventory.reserved], ["Unsellable", inventory.unsellable]] : []),
  ];

  return <main className="amazon-product-page product-details-clean">
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- This Vinext app uses anchor navigation and does not install next/link. */}
    <header className="product-details-header"><a className="amazon-product-back" href="/?page=productCatalog">← Product Catalogue</a><h1>Product details</h1>{product?.pulledAt && <small>Updated {new Date(product.pulledAt).toLocaleString()}</small>}</header>
    <GlobalDateRangeFilter showProducts={false} defaultRange={defaultRange} />
    {error ? <p role="alert" className="product-details-message">{error}</p> : !product ? <p role="status">Loading product details…</p> : <>
      <section className="product-details-panel product-details-overview">
        <div className="product-details-gallery">
          {product.images.length ? <><img className="product-details-main-image" src={product.images[imageIndex]?.link} alt={product.title} /><div className="product-details-thumbnails">{product.images.map((image, index) => <button type="button" key={`${image.variant}-${index}`} aria-label={`Show ${image.variant} image`} aria-pressed={imageIndex === index} onClick={() => setImageIndex(index)}><img src={image.link} alt={image.variant} /></button>)}</div></> : <p>No product image</p>}
        </div>
        <div className="product-details-identity"><div className="product-details-title"><h2>{product.title}</h2><a className="catalog-detail-trigger" href={`https://www.amazon.com/dp/${encodeURIComponent(product.asin)}`} target="_blank" rel="noopener noreferrer">Open on Amazon ↗</a></div><table className="product-details-table product-details-key-values"><caption>Product overview</caption><tbody>{overview.map(([label, value]) => <tr key={String(label)}><th scope="row">{label}</th><td>{shown(value)}</td></tr>)}</tbody></table></div>
      </section>
      <ProductSalesChart points={productSalesPoints} />
      {catalogError && <p className="product-details-message" role="status">{catalogError}</p>}
      {totals.length > 0 && <section className="product-details-panel"><h2>Sales overview</h2><div className="product-details-table-scroll"><table className="product-details-table"><thead><tr><th scope="col">Currency</th><th scope="col" className="is-number">Sales</th><th scope="col" className="is-number">Units</th><th scope="col">Period</th></tr></thead><tbody>{totals.map(sale => <tr key={sale.currency}><td>{sale.currency}</td><td className="is-number">{money(sale.amount, sale.currency)}</td><td className="is-number">{sale.units == null ? "—" : sale.units.toLocaleString("en-US")}</td><td>{rangeActive ? `${startDate} – ${endDate}` : "All saved months"}</td></tr>)}</tbody></table></div>{rangeActive && <small className="product-details-note">Monthly totals for overlapping months. Units for a custom date range are not available.</small>}</section>}
      {months.length > 0 && <section className="product-details-panel"><h2>Monthly sales</h2><div className="product-details-table-scroll product-details-monthly"><table className="product-details-table"><thead><tr><th scope="col">Month</th><th scope="col">Currency</th><th scope="col" className="is-number">Sales</th></tr></thead><tbody>{months.map(row => <tr key={`${row.month}-${row.currency}`}><td>{new Date(`${row.month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</td><td>{row.currency}</td><td className="is-number">{money(row.amount, row.currency)}</td></tr>)}</tbody></table></div></section>}
      <div className="product-details-specifications">{specificationColumns.map((column, index) => <div className="product-details-specification-column" key={index}>{column.map(section => <section className="product-details-panel" key={section.title}><h2>{section.title}</h2><table className="product-details-table product-details-key-values"><tbody>{section.fields.map(field => <tr key={field.key}><th scope="row">{field.label}</th><td>{clean(field.value)}</td></tr>)}</tbody></table></section>)}</div>)}</div>
    </>}
  </main>;
}
