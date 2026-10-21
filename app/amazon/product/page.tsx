"use client";
import { useEffect, useState } from "react";

type Product = {
  asin: string; title: string; brand: string; description: string; bullets: string[];
  images: { variant: string; link: string; width: number; height: number }[];
  sections: { title: string; fields: { key: string; label: string; value: string }[] }[];
  allAttributes: { key: string; label: string; value: string }[]; rawAttributes: Record<string, unknown>;
  sellerListing: boolean; fullDatasetsPulled: boolean; pulledAt: string | null;
  listings: { sku: string; price: string; quantity: string; fulfillment: string; status: string }[];
  identifiers: unknown[]; dimensions: unknown[]; classifications: unknown[]; salesRanks: unknown[]; relationships: unknown[]; productTypes: unknown[];
};
const clean = (value: string) => value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
export default function AmazonProductPage() {
  const [asin, setAsin] = useState(""); const [product, setProduct] = useState<Product | null>(null); const [error, setError] = useState(""); const [image, setImage] = useState(0); const [query, setQuery] = useState("");
  useEffect(() => { setAsin(new URLSearchParams(window.location.search).get("asin") || "B08KSJNG6G"); }, []);
  useEffect(() => { if (!asin) return; let active = true; setProduct(null); setError(""); setImage(0); fetch(`/api/amazon/product?asin=${encodeURIComponent(asin)}`).then(async response => { const body = await response.json(); if (!response.ok) throw Error(body.error); if (active) setProduct(body); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [asin]);
  const panel = { background: "white", border: "1px solid #dde5ef", borderRadius: 12, padding: 24, marginBottom: 20 };
  return <main style={{ margin: 0, padding: "32px clamp(16px, 4vw, 64px)", minHeight: "100vh", background: "#f5f7fb", color: "#17243b" }}>
    <a href="/amazon">← Back to Amazon data</a>
    <h1 style={{ marginTop: 24 }}>Amazon Product Details</h1>
    {error ? <p role="alert">{error}</p> : !product ? <p>Loading Amazon product details…</p> : <>
      <section style={panel}><h2>{product.title}</h2><p>ASIN: {product.asin} · Brand: {product.brand || "Not returned"} · United States</p>
        <p>{product.sellerListing ? `CDC catalog SKUs: ${product.listings.map(item => item.sku).join(", ")}` : "Reference product: this ASIN is not in the downloaded CDC seller listings."}</p>
        <p>{product.pulledAt ? `API data saved ${new Date(product.pulledAt).toLocaleString()}.` : "Saved Amazon catalog data."} {product.fullDatasetsPulled ? "Expanded datasets pulled." : "Additional datasets are being pulled; refresh to see updates."} Fields reflect the API response and can differ from Amazon’s retail page.</p>
      </section>
      {product.listings.length > 0 && <section style={panel}><h2>CDC seller listings</h2><div style={{ overflowX: "auto" }}><table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}><thead><tr>{["SKU", "Listing price (USD)", "Seller listing quantity", "Fulfillment code", "Status"].map(title => <th key={title} style={{ padding: 12 }}>{title}</th>)}</tr></thead><tbody>{product.listings.map(listing => <tr key={listing.sku}>{[listing.sku, listing.price, listing.quantity, listing.fulfillment, listing.status].map((value, index) => <td key={index} style={{ padding: 12, borderBottom: "1px solid #edf2fa" }}>{value === "" || value == null ? "Not returned" : value}</td>)}</tr>)}</tbody></table></div><p>Seller listing quantities and FBA inventory are separate sources. These are saved report values.</p></section>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <section style={{ ...panel, flex: "1 1 340px", minWidth: 0 }}>
          {product.images.length ? <><img src={product.images[image]?.link} alt={`${product.title} — ${product.images[image]?.variant}`} style={{ width: "100%", height: 420, objectFit: "contain" }} /><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{product.images.map((item, index) => <button key={item.variant} onClick={() => setImage(index)} aria-label={`Show ${item.variant} image`} aria-pressed={image === index} style={{ padding: 4, border: image === index ? "2px solid #2554cf" : "1px solid #dde5ef", background: "white", borderRadius: 8 }}><img src={item.link} alt={item.variant} style={{ width: 60, height: 60, objectFit: "contain" }} /></button>)}</div></> : <p>No images returned by Amazon for this product.</p>}
        </section>
        <div style={{ flex: "2 1 480px", minWidth: 0 }}>
          <section style={panel}><h2>About this item</h2>{product.bullets.length ? <ul style={{ paddingLeft: 24 }}>{product.bullets.map((bullet, index) => <li key={index} style={{ marginBottom: 12, lineHeight: 1.6 }}>{clean(bullet)}</li>)}</ul> : <p>Bullet points were not returned.</p>}</section>
          <section style={panel}><h2>Product description</h2><p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{product.description ? clean(product.description) : "Description was not returned."}</p></section>
          {product.sections.map(section => <section key={section.title} style={panel}><h2>{section.title}</h2>{section.fields.length ? <dl>{section.fields.map(field => <div key={field.key} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 2fr", gap: 16, padding: "12px 0", borderBottom: "1px solid #edf2fa" }}><dt style={{ fontWeight: 600 }}>{field.label}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{clean(field.value)}</dd></div>)}</dl> : <p>No fields in this section returned by Amazon.</p>}</section>)}
        </div>
      </div>
      <section style={panel}><h2>All returned attributes ({product.allAttributes.length})</h2><input aria-label="Search product attributes" placeholder="Search attributes…" value={query} onChange={e => setQuery(e.target.value)} style={{ padding: 12, margin: "12px 0", border: "1px solid #ccd4e1", borderRadius: 8 }} />
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}><thead><tr><th style={{ padding: 12 }}>Amazon field</th><th style={{ padding: 12 }}>Value</th></tr></thead><tbody>{product.allAttributes.filter(field => `${field.key} ${field.value}`.toLowerCase().includes(query.toLowerCase())).map(field => <tr key={field.key}><td style={{ padding: 12, verticalAlign: "top", borderBottom: "1px solid #edf2fa" }}>{field.key}</td><td style={{ padding: 12, whiteSpace: "pre-wrap", overflowWrap: "anywhere", borderBottom: "1px solid #edf2fa" }}>{clean(field.value)}</td></tr>)}</tbody></table></div>
      </section>
      <section style={panel}><h2>Additional Amazon datasets</h2>{(["identifiers", "dimensions", "classifications", "salesRanks", "relationships", "productTypes", "rawAttributes"] as const).map(key => <details key={key} style={{ padding: "12px 0" }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>{key}</summary><pre style={{ overflowX: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 400, background: "#edf2fa", padding: 16 }}>{JSON.stringify(product[key], null, 2)}</pre></details>)}</section>
    </>}
  </main>;
}
