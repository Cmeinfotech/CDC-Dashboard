export const headerAliases = {
  month: ["month", "date", "reporting month"], parentAsin: ["(parent) asin", "parent asin", "parentasin"], childAsin: ["(child) asin", "child asin", "asin"],
  title: ["title", "product title", "item name"], sessions: ["sessions - total", "sessions total", "sessions"], pageViews: ["page views - total", "page views total", "page views"],
  units: ["units ordered", "units"], conversion: ["unit session percentage", "unit session %", "conversion rate"], sales: ["ordered product sales", "product sales", "sales"], orders: ["total order items", "order items", "orders"],
  sku: ["sku", "seller sku"], relationship: ["parent/child", "parent child", "relationship type"], parentSku: ["parent sku", "parent_sku"], color: ["color", "colour"], size: ["size"], style: ["style"], metalType: ["metal type"], imageUrl: ["image", "main image url", "image url"],
  orderId: ["amazon order id", "order id", "order-id"], orderDate: ["purchase date", "order date", "date"], orderStatus: ["order status", "status"], quantity: ["quantity", "quantity purchased", "units"], itemPrice: ["item price", "item total", "order total", "sales"],
} as const;
export type CanonicalHeader = keyof typeof headerAliases;
const clean=(v:unknown)=>String(v??"").trim().toLowerCase().replace(/\s+/g," ");
export function mapHeaders(headers:unknown[]){const result:Partial<Record<CanonicalHeader,string>>={};for(const raw of headers){const h=clean(raw);for(const [key,aliases] of Object.entries(headerAliases)){if((aliases as readonly string[]).some(a=>clean(a)===h)){result[key as CanonicalHeader]=String(raw);break;}}}return result;}
