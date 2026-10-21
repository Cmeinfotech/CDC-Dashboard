import { readAmazonJson } from "../../../../services/amazonDataSecurity.mjs";
import { accessGuard } from "../../../../services/accessSecurity.mjs";
import { stat } from "node:fs/promises";
import { join } from "node:path";

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  try {
    const folder = join(process.cwd(), "outputs", "amazon-cdc");
    const inventoryFile = join(folder, "inventory.json");
    const ordersFile = join(folder, "orders.json");
    const [inventory, orders, info] = await Promise.all([readAmazonJson(inventoryFile), readAmazonJson(ordersFile), stat(inventoryFile)]);
    const optional = async (name: string) => { try { return await readAmazonJson(join(folder, name + ".json")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
    const [catalog, report, status, attributes] = await Promise.all([optional("catalog"), optional("order-report"), optional("pull-status"), optional("catalog-attributes")]);
    const attributesByAsin = new Map<string, any>((attributes?.items || []).map((item: any) => [item.asin, item]));
    const skusByAsin = new Map<string, Set<string>>();
    const stockBySkuAsin = new Map<string, { total: number; sellable: number }>();
    for (const stock of inventory.payload?.inventorySummaries || []) {
      const key = `${stock.sellerSku}:${stock.asin}`;
      const current = stockBySkuAsin.get(key) || { total: 0, sellable: 0 };
      current.total += Number(stock.totalQuantity || 0);
      current.sellable += Number(stock.inventoryDetails?.fulfillableQuantity || 0);
      stockBySkuAsin.set(key, current);
    }
    for (const row of catalog?.rows || []) {
      const sku = row['seller-sku'];
      if (!row.asin1 || !sku) continue;
      const skus = skusByAsin.get(row.asin1) || new Set<string>();
      skus.add(sku); skusByAsin.set(row.asin1, skus);
    }
    const catalogRows = (catalog?.rows || []).map((row: any) => {
      const item = attributesByAsin.get(row.asin1);
      const summary = item?.summaries?.find((s: any) => s.marketplaceId === "ATVPDKIKX0DER");
      const value = (key: string) => item?.attributes?.[key]?.map((entry: any) => entry.value || (Array.isArray(entry.size) ? entry.size.map((size: any) => size.value).filter(Boolean).join(", ") : typeof entry.size === "string" ? entry.size : "")).filter(Boolean).join(", ") || "";
      const relationships = (item?.relationships?.find((r: any) => r.marketplaceId === "ATVPDKIKX0DER")?.relationships || []).filter((r: any) => r.type === "VARIATION");
      const parentAsins = [...new Set<string>(relationships.flatMap((r: any) => r.parentAsins || []))];
      const childAsins = [...new Set<string>(relationships.flatMap((r: any) => r.childAsins || []))];
      const parentSkus = parentAsins.length === 1 ? skusByAsin.get(parentAsins[0]) : undefined;
      const parentSku = parentSkus?.size === 1 ? [...parentSkus][0] : "";
      const parentageLevel = parentAsins.length ? "Child" : childAsins.length ? "Parent" : "Unknown";
      const stock = stockBySkuAsin.get(`${row['seller-sku']}:${row.asin1}`);
      const fulfillmentCode = row['fulfillment-channel'];
      const fulfillmentLabel = fulfillmentCode === "AMAZON_NA" ? "Amazon (FBA)" : fulfillmentCode === "DEFAULT" ? "Seller fulfilled (FBM)" : fulfillmentCode || "Not provided";
      const familyChildren = parentAsins.length === 1
        ? (attributesByAsin.get(parentAsins[0])?.relationships?.find((r: any) => r.marketplaceId === "ATVPDKIKX0DER")?.relationships || []).filter((r: any) => r.type === "VARIATION").flatMap((r: any) => r.childAsins || [])
        : childAsins;
      const familyChildAsins = [...new Set<string>(familyChildren)];
      const isFba = fulfillmentCode === "AMAZON_NA";
      const isFbm = fulfillmentCode === "DEFAULT";
      const listingQuantity = row.quantity === "" || row.quantity == null ? null : row.quantity;
      const stockFields = {
        childAsin: parentageLevel === "Child" ? row.asin1 : parentageLevel === "Parent" ? "Not applicable" : "Unknown",
        familyChildAsins: familyChildAsins.join(", "), familyChildCount: familyChildAsins.length || null,
        displayQuantity: parentageLevel === "Parent" ? "Not applicable" : isFba ? stock?.total ?? null : isFbm ? listingQuantity : null,
        quantitySource: parentageLevel === "Parent" ? "Parent listing" : isFba ? "FBA total inventory" : isFbm ? "Seller listings report" : "Unknown",
        listingQuantity: isFba && listingQuantity == null ? "Not applicable (FBA)" : listingQuantity,
        fbaTotalQuantity: stock?.total ?? (isFbm ? "Not applicable (FBM)" : null),
        fbaSellableQuantity: stock?.sellable ?? (isFbm ? "Not applicable (FBM)" : null), fulfillmentCode, fulfillmentLabel,
      };
      return { ...stockFields, sku: row['seller-sku'], asin: row.asin1, productName: row['item-name'] || row['\uFEFFitem-name'], price: row.price, quantity: row.quantity, status: row.status, fulfillment: row['fulfillment-channel'], parentAsin: parentAsins.join(", "), childAsins: childAsins.join(", "), parentSku, parentageLevel, parentSkuStatus: parentageLevel === "Parent" ? "Not applicable" : parentSku ? "Mapped" : "Unresolved", color: summary?.color || value("color"), size: summary?.size || value("size") || value("ring"), style: summary?.style || value("style"), metal: value("metal_type"), attributesAvailable: Boolean(item) };
    });
    const rawOrderRows = report?.rows || [];
    const usOrderRows = rawOrderRows.filter((row: any) => row['sales-channel'] === "Amazon.com");
    const checkedResponses = await Promise.all([optional("order-item-check-0"), optional("order-item-check-1"), optional("order-item-check-2")]);
    const checkedItems = new Map<string, any>();
    for (const response of checkedResponses) for (const item of response?.payload?.OrderItems || []) {
      if (item.OrderItemId) checkedItems.set(item.OrderItemId, item);
    }
    const orderItemRows = usOrderRows.map((row: any) => {
      const direct = checkedItems.get(row['order-item-id']);
      const amount = (reportKey: string, directKey: string) => {
        const reported = row[reportKey];
        if (reported != null && reported !== "") return reported;
        const money = direct?.[directKey];
        return money?.Amount != null && (!row.currency || money.CurrencyCode === row.currency) ? money.Amount : "";
      };
      return { orderId: row['amazon-order-id'], purchaseDate: row['purchase-date'], month: /^\d{4}-\d{2}-\d{2}/.test(row['purchase-date'] || "") ? row['purchase-date'].slice(0, 7) : "", salesChannel: row['sales-channel'], asin: row.asin, sku: row.sku, productName: row['product-name'], quantity: row.quantity, currency: row.currency || direct?.ItemPrice?.CurrencyCode || "", price: amount('item-price', 'ItemPrice'), tax: amount('item-tax', 'ItemTax'), shipping: amount('shipping-price', 'ShippingPrice'), discount: amount('item-promotion-discount', 'PromotionDiscount'), status: row['order-status'], itemStatus: row['item-status'], fulfillment: row['fulfillment-channel'], directItemChecked: Boolean(direct) };
    });
    return Response.json({
      account: "Central Diamond Center", marketplace: "United States", pulledAt: info.mtime.toISOString(),
      status,
      orderCoverage: { rawRows: rawOrderRows.length, usRows: usOrderRows.length, excludedOtherChannels: rawOrderRows.length - usOrderRows.length, uniqueUsOrders: new Set(usOrderRows.map((row: any) => row['amazon-order-id'])).size },
      attributesProgress: attributes ? { complete: attributes.complete, requested: attributes.requested, count: attributes.count, missing: attributes.missing?.length } : null,
      catalog: catalogRows,
      orderItems: orderItemRows,
      inventory: (inventory.payload?.inventorySummaries || []).map((row: any) => ({
        asin: row.asin, sku: row.sellerSku, fnSku: row.fnSku, productName: row.productName,
        condition: row.condition, totalQuantity: row.totalQuantity,
        sellable: row.inventoryDetails?.fulfillableQuantity ?? 0,
        reserved: row.inventoryDetails?.reservedQuantity?.totalReservedQuantity ?? 0,
        unsellable: row.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity ?? 0,
        lastUpdated: row.lastUpdatedTime,
      })),
      orders: (orders.payload?.Orders || []).map((row: any) => ({
        orderId: row.AmazonOrderId, purchaseDate: row.PurchaseDate, status: row.OrderStatus,
        channel: row.FulfillmentChannel, salesChannel: row.SalesChannel,
        shipped: row.NumberOfItemsShipped, unshipped: row.NumberOfItemsUnshipped,
        prime: row.IsPrime, business: row.IsBusinessOrder,
      })),
      moreInventory: Boolean(inventory.pagination?.nextToken), moreOrders: Boolean(orders.payload?.NextToken),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Pulled CDC data is unavailable. Pull the Amazon data on this server first." }, { status: 404 });
  }
}
