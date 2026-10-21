import { readAmazonJson } from "../../../../services/amazonDataSecurity.mjs";
import { accessGuard } from "../../../../services/accessSecurity.mjs";
import { join } from "node:path";

const marketplace = "ATVPDKIKX0DER";
const label = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
const text = (value: unknown): string => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("; ");
  if (typeof value !== "object") return String(value);
  const object = value as Record<string, unknown>;
  if (object.decimal_value != null && Object.keys(object).every(key => ["decimal_value", "unit", "language_tag", "marketplace_id"].includes(key))) return `${text(object.decimal_value)}${object.unit ? ` ${object.unit}` : ""}`;
  if (object.value != null && Object.keys(object).every(key => ["value", "unit", "language_tag", "marketplace_id"].includes(key))) return `${text(object.value)}${object.unit ? ` ${object.unit}` : ""}`;
  return Object.entries(object).filter(([key]) => !["marketplace_id", "language_tag"].includes(key)).map(([key, entry]) => `${label(key)}: ${text(entry)}`).join("; ");
};

export async function GET(request: Request) {
  const denied = accessGuard(request, { amazon: true }); if (denied) return denied;
  const asin = new URL(request.url).searchParams.get("asin")?.toUpperCase() || "";
  if (!/^[A-Z0-9]{10}$/.test(asin)) return Response.json({ error: "Enter a valid 10-character ASIN." }, { status: 400 });
  const folder = join(process.cwd(), "outputs", "amazon-cdc");
  const read = async (name: string) => { try { return await readAmazonJson(join(folder, name + ".json")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } };
  const [full, previous, reference, catalog] = await Promise.all([read("catalog-full-details"), read("catalog-attributes"), read("reference-product"), read("catalog")]);
  const item = full?.items?.find((row: any) => row.asin === asin) || (reference?.item?.asin === asin ? reference.item : null) || previous?.items?.find((row: any) => row.asin === asin);
  if (!item) return Response.json({ error: "Amazon has not returned saved details for this ASIN." }, { status: 404 });
  const attributes = Object.fromEntries(Object.entries(item.attributes || {}).map(([key, values]) => [key, Array.isArray(values) ? values.filter((value: any) => !value.marketplace_id || value.marketplace_id === marketplace) : values]));
  const get = (key: string) => text(attributes[key]);
  const summary = item.summaries?.find((row: any) => row.marketplaceId === marketplace) || {};
  const select = (keys: string[]) => keys.filter(key => get(key)).map(key => ({ key, label: label(key), value: get(key) }));
  const groups = [
    { title: "Materials & Care", keys: ["material", "metal_type", "metal_stamp", "primary_stone", "gem_type", "chain_type", "chain_length", "clasp_type", "grade_rating", "care_instructions"] },
    { title: "Style", keys: ["occasion_type", "color", "size", "ring", "finish_type", "metal_finish", "style", "stone", "collection", "theme", "target_audience", "target_gender", "department", "life_event", "special_feature"] },
    { title: "Product specifications", keys: ["brand", "manufacturer", "model_number", "part_number", "item_type_keyword", "setting_type", "number_of_stones", "total_gem_weight", "total_diamond_weight", "item_weight", "item_diameter", "item_width", "item_length", "item_dimensions", "item_package_dimensions", "item_package_weight", "back_finding", "earring_design", "earring_length", "is_resizable", "included_components", "set_name", "product_site_launch_date"] },
  ];
  const sections = groups.map(group => ({ title: group.title, fields: select(group.keys) }));
  const stoneValues = Array.isArray(attributes.stone) ? attributes.stone as Record<string, unknown>[] : [];
  for (const [key, title] of [["shape", "Stone Shape"], ["color", "Stone Color"], ["cut", "Stone Cut"]]) {
    const values = [...new Set(stoneValues.map(stone => text(stone[key])).filter(Boolean))];
    if (values.length) sections[1].fields.push({ key: `stone.${key}`, label: title, value: values.join("; ") });
  }
  const imageGroups = item.images?.filter((row: any) => row.marketplaceId === marketplace) || [];
  const imageMap = new Map<string, any>();
  for (const image of imageGroups.flatMap((group: any) => group.images || [])) {
    if (typeof image.link !== "string" || !/^https:\/\/(?:m\.media-amazon\.com|images-na\.ssl-images-amazon\.com|images\.amazon\.com)\//.test(image.link)) continue;
    const old = imageMap.get(image.variant);
    if (!old || image.width * image.height > old.width * old.height) imageMap.set(image.variant, image);
  }
  const listings = (catalog?.rows || []).filter((row: any) => row.asin1 === asin).map((row: any) => ({ sku: row['seller-sku'], price: row.price, quantity: row.quantity, fulfillment: row['fulfillment-channel'], status: row.status }));
  return Response.json({ asin, marketplaceId: marketplace, title: summary.itemName || get("item_name"), brand: summary.brand || get("brand"),
    description: get("product_description"), bullets: Array.isArray(attributes.bullet_point) ? (attributes.bullet_point as unknown[]).map(text).filter(Boolean) : [],
    images: [...imageMap.values()].sort((a, b) => a.variant === "MAIN" ? -1 : b.variant === "MAIN" ? 1 : a.variant.localeCompare(b.variant)),
    sections, allAttributes: Object.keys(attributes).sort().filter(key => get(key)).map(key => ({ key, label: label(key), value: get(key) })), rawAttributes: attributes,
    identifiers: item.identifiers?.filter((row: any) => row.marketplaceId === marketplace) || [], dimensions: item.dimensions?.filter((row: any) => row.marketplaceId === marketplace) || [],
    classifications: item.classifications?.filter((row: any) => row.marketplaceId === marketplace) || [], salesRanks: item.salesRanks?.filter((row: any) => row.marketplaceId === marketplace) || [],
    relationships: item.relationships?.filter((row: any) => row.marketplaceId === marketplace) || [], productTypes: item.productTypes?.filter((row: any) => row.marketplaceId === marketplace) || [],
    listings, sellerListing: listings.length > 0, fullDatasetsPulled: Boolean(full?.items?.some((row: any) => row.asin === asin) || reference?.item?.asin === asin), pulledAt: full?.items?.some((row: any) => row.asin === asin) ? full.pulledAt : reference?.item?.asin === asin ? reference.pulledAt : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
