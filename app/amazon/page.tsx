"use client";

import { useEffect, useRef, useState } from "react";
import { searchAmazonRecords } from '../../services/amazonSearch.mjs';

type Preview = { orderCoverage?: { rawRows: number; usRows: number; excludedOtherChannels: number; uniqueUsOrders: number }; pulledAt: string; inventory: Record<string, unknown>[]; orders: Record<string, unknown>[]; catalog: Record<string, unknown>[]; orderItems: Record<string, unknown>[]; attributesProgress?: { complete: boolean; requested: number; count: number; missing: number }; status?: { inventory?: { status: string }; catalog?: { status: string }; orderReport?: { status: string }; period?: { start: string; end: string } }; moreInventory: boolean; moreOrders: boolean };
const catalogColumns = { productDetails: "Full details", asin: "ASIN", sku: "SKU", productName: "Product name", parentageLevel: "Parentage Level", parentSku: "Parent SKU", parentSkuStatus: "Parent SKU mapping", parentAsin: "Parent ASIN", childAsin: "Child ASIN", familyChildAsins: "Family child ASINs", familyChildCount: "Family child count", color: "Color", size: "Size", style: "Style", metal: "Metal", price: "Price", displayQuantity: "Quantity", quantitySource: "Quantity source", listingQuantity: "Seller listings quantity", fbaTotalQuantity: "FBA total stock", fbaSellableQuantity: "FBA sellable stock", status: "Status", fulfillmentLabel: "Fulfillment", fulfillmentCode: "Fulfillment code", attributesAvailable: "Attributes pulled" };
const itemColumns = { orderId: "Order ID", purchaseDate: "Purchase date", month: "Month (source date)", salesChannel: "Sales channel", asin: "ASIN", sku: "SKU", productName: "Product name", quantity: "Quantity", currency: "Currency", price: "Item price", tax: "Tax", shipping: "Shipping", discount: "Discount", status: "Order status", itemStatus: "Item status", fulfillment: "Fulfillment" };
const inventoryColumns = { asin: "ASIN", sku: "Seller SKU", productName: "Product name", totalQuantity: "Total stock", sellable: "Sellable", reserved: "Reserved", unsellable: "Unsellable", fnSku: "FNSKU", condition: "Condition", lastUpdated: "Updated" };
const orderColumns = { orderId: "Order ID", purchaseDate: "Purchase date", status: "Status", channel: "Fulfillment", salesChannel: "Sales channel", shipped: "Items shipped", unshipped: "Items unshipped", prime: "Prime", business: "Business order" };

export default function AmazonPreview() {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"inventory" | "orders" | "catalog" | "orderItems">("inventory");
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<Record<string, unknown> | null>(null);
  const familyDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (family && familyDialog.current && !familyDialog.current.open) familyDialog.current.showModal(); }, [family]);
  useEffect(() => { let active = true; fetch("/api/amazon/preview").then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (active) setData(body); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const [limit, setLimit] = useState(100);
  const search = query.trim().toLowerCase();
  const rows: Record<string, unknown>[] = search ? searchAmazonRecords(data, query) : (data?.[tab] || []);
  const searchColumns = {source:'Dataset',productDetails:'Full details',asin:'ASIN',sku:'SKU',productName:'Product name',stockQuantity:'Stock quantity',stockSource:'Stock source',fulfillmentLabel:'Fulfillment',price:'Price',sellable:'FBA sellable',reserved:'FBA reserved',unsellable:'FBA unsellable',status:'Status',orderId:'Order ID',purchaseDate:'Purchase date',orderQuantity:'Order quantity',currency:'Currency',lastUpdated:'Inventory updated'};
  const columns = search ? Object.fromEntries(Object.entries(searchColumns).filter(([key])=>rows.some(row=>row[key]!==null && row[key]!==undefined && row[key]!==''))) : tab === "inventory" ? inventoryColumns : tab === "catalog" ? catalogColumns : tab === "orderItems" ? itemColumns : orderColumns;
  return <main style={{ margin: 0, padding: "32px clamp(16px, 4vw, 64px)", minHeight: "100vh", background: "#f5f7fb" }}>
    <a href="/" style={{ color: "#2554cf" }}>← Back to sales dashboard</a>
    <div className="page-heading" style={{ marginTop: 24 }}><div><h1>Amazon Live Data</h1><p>Central Diamond Center · United States · Data pulled from Amazon SP-API</p></div></div>
    <section className="panel" style={{ padding: 20, marginBottom: 20 }}>
      <strong>Saved Amazon data</strong><p>Downloaded records from CDC US. Refresh this page to see newly completed pulls. This is not a continuously refreshing feed.</p>
      {data && <p>{data.inventory.length.toLocaleString()} FBA inventory records · {data.catalog.length.toLocaleString()} catalog listings · {data.orderItems.length.toLocaleString()} order item rows · Saved {new Date(data.pulledAt).toLocaleString()}</p>}
      {data?.attributesProgress && <p>Detailed catalog attributes: {data.attributesProgress.count.toLocaleString()} of {data.attributesProgress.requested.toLocaleString()} ASINs returned · {data.attributesProgress.complete ? "Pull complete" : "Pull in progress"} · {data.attributesProgress.missing} unavailable</p>}
      {data?.orderCoverage && <p>US order items: {data.orderCoverage.usRows.toLocaleString()} rows / {data.orderCoverage.uniqueUsOrders.toLocaleString()} orders. {data.orderCoverage.excludedOtherChannels} other-channel rows excluded from this US view. Blank amounts are shown as Amazon returned them, including on cancelled orders; they are not replaced with zero.</p>}
      <p>Inventory: {data?.status?.inventory?.status || "preview"} · Catalog: {data?.status?.catalog?.status || "pending"} · Order report: {data?.status?.orderReport?.status || "pending"}</p>
      {data?.status?.period && <p>Order report period: {data.status.period.start} to {data.status.period.end}. The Orders tab retains the original 10-order sample; Order Items shows the downloaded report.</p>}
      <p>Sales/traffic metrics depend on an authorized sales report. Child ASIN is this listing. Family child ASINs come from its parent’s Amazon relationships. Quantity uses FBA total stock for FBA listings and seller listing stock for FBM listings. Not applicable indicates a different fulfillment channel; Not provided means the source returned no value.</p>
    </section>
    {error ? <p role="alert">{error}</p> : !data ? <p>Loading pulled Amazon data…</p> : <section className="panel" style={{ padding: 20 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <button className="btn" aria-pressed={tab === "inventory"} onClick={() => { setTab("inventory"); setLimit(100); }}>FBA Inventory ({data.inventory.length})</button>
        <button className="btn" aria-pressed={tab === "orders"} onClick={() => { setTab("orders"); setLimit(100); }}>Orders ({data.orders.length})</button>
        <button className="btn" aria-pressed={tab === "catalog"} onClick={() => { setTab("catalog"); setLimit(100); }}>Catalog ({data.catalog.length})</button>
        <button className="btn" aria-pressed={tab === "orderItems"} onClick={() => { setTab("orderItems"); setLimit(100); }}>Order Items ({data.orderItems.length})</button>
        <a className="btn" href="/amazon/account-health" style={{ padding: '10px 16px', border: '1px solid #2554cf', borderRadius: 8, color: '#2554cf', textDecoration: 'none', fontWeight: 600 }}>Amazon Account Health</a>
        <input aria-label="Search pulled records" placeholder="Search these records…" value={query} onChange={e => setQuery(e.target.value)} style={{ padding: "10px 14px", border: "1px solid #ccd4e1", borderRadius: 8 }} />
        {search && <p>Searching all saved datasets by ASIN, SKU, product name or order ID. Exact ASIN/SKU matches appear first; family metadata is excluded.</p>}
      </div>
      <h2>{search ? 'Search results across all datasets' : tab === "inventory" ? "FBA Inventory" : tab === "catalog" ? "Product Catalog" : tab === "orderItems" ? "Order Items" : "Orders sample"}</h2>
      <p>{rows.length} matching records · showing {Math.min(limit, rows.length)}. {((tab === "inventory" && data.moreInventory) || (tab === "orders" && data.moreOrders)) && "This dataset is partial; more records are available."}</p>
      <div style={{ overflowX: "auto", marginTop: 16 }}><table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
        <thead><tr>{Object.entries(columns).map(([key, label]) => <th key={key} style={{ padding: 12, whiteSpace: "nowrap", background: "#edf2fa" }}>{label}</th>)}</tr></thead>
        <tbody>{rows.slice(0, limit).map((row, index) => <tr key={index}>{Object.keys(columns).map(key => <td key={key} style={{ padding: 12, borderBottom: "1px solid #e4e9f1", verticalAlign: "top", whiteSpace: "nowrap", fontSize: 13 }}>
          {key === "productDetails" && row.asin ? <a href={`/amazon/product?asin=${encodeURIComponent(String(row.asin))}`} style={{ color: "#2554cf", fontWeight: 600 }}>View details</a> : key === "familyChildAsins" ? row.familyChildAsins ? <button className="btn" onClick={() => setFamily(row)} aria-label={`View family child ASINs for ${row.sku}`}>{String(row.familyChildCount)} ASINs · View</button> : "Not provided" : key === "productName" || key === "style" || key === "metal" ? <div title={String(row[key] || "")} style={{ width: key === "productName" ? 330 : 180, whiteSpace: "normal", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{String(row[key] || "Not provided")}</div> : typeof row[key] === "boolean" ? row[key] ? "Yes" : "No" : row[key] == null || row[key] === "" ? "Not provided" : String(row[key])}
        </td>)}</tr>)}</tbody>
      </table>{!rows.length && <p>No matching records.</p>}</div>
      {rows.length > limit && <button className="btn" onClick={() => setLimit(value => value + 100)} style={{ marginTop: 16 }}>Show 100 more</button>}
    </section>}
    <dialog ref={familyDialog} aria-labelledby="family-heading" onClose={() => setFamily(null)} style={{ width: "min(720px, 90vw)", maxHeight: "80vh", padding: 24, border: "1px solid #ccd4e1", borderRadius: 12, color: "#17243b" }}>
      {family && <>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><h2 id="family-heading">Family child ASINs ({family.familyChildCount as number})</h2><button className="btn" onClick={() => familyDialog.current?.close()} autoFocus>Close</button></div>
        <p>SKU: {String(family.sku)} · Parent ASIN: {String(family.parentAsin || family.asin)}</p>
        <p>{String(family.productName)}</p>
        <div style={{ maxHeight: "50vh", overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginTop: 16 }}>
          {String(family.familyChildAsins).split(", ").map(asin => <span key={asin} style={{ padding: 10, background: "#edf2fa", borderRadius: 6, fontFamily: "monospace" }}>{asin}</span>)}
        </div>
      </>}
    </dialog>
  </main>;
}
