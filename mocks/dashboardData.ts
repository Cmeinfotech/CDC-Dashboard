export type Trend = "growing" | "stable" | "declining";

export type Product = {
  parent: string;
  name: string;
  category: string;
  trend: Trend;
  children: { asin: string; label: string; status: "Active" | "Previous" }[];
};

export const products: Product[] = [
  { parent: "P-1001", name: "Industrial Safety Gloves", category: "Safety", trend: "growing", children: [
    { asin: "B000NEW001", label: "Large · Orange", status: "Active" },
    { asin: "B000OLD001", label: "Large · Orange (legacy)", status: "Previous" },
    { asin: "B000GLV002", label: "Medium · Orange", status: "Active" },
    { asin: "B000GLV003", label: "XL · Black", status: "Active" },
  ]},
  { parent: "P-1002", name: "Precision Tool Set", category: "Tools", trend: "stable", children: [
    { asin: "B000TLS011", label: "46 Piece", status: "Active" }, { asin: "B000TLS012", label: "72 Piece", status: "Active" }, { asin: "B000TLS013", label: "108 Piece", status: "Active" },
  ]},
  { parent: "P-1003", name: "Heavy Duty Storage Bins", category: "Storage", trend: "growing", children: [
    { asin: "B000BIN021", label: "27 Gallon", status: "Active" }, { asin: "B000BIN022", label: "40 Gallon", status: "Active" }, { asin: "B000BIN023", label: "55 Gallon", status: "Active" },
  ]},
  { parent: "P-1004", name: "LED Work Lights", category: "Lighting", trend: "growing", children: [
    { asin: "B000LGT031", label: "2,000 Lumens", status: "Active" }, { asin: "B000LGT032", label: "5,000 Lumens", status: "Active" }, { asin: "B000LGT033", label: "8,000 Lumens", status: "Active" },
  ]},
  { parent: "P-1005", name: "Respirator Mask Kit", category: "Safety", trend: "declining", children: [
    { asin: "B000MSK041", label: "Medium", status: "Active" }, { asin: "B000MSK042", label: "Large", status: "Active" }, { asin: "B000OLD042", label: "Large (legacy)", status: "Previous" },
  ]},
  { parent: "P-1006", name: "Cordless Drill System", category: "Power Tools", trend: "stable", children: [
    { asin: "B000DRL051", label: "18V Compact", status: "Active" }, { asin: "B000DRL052", label: "20V Max", status: "Active" }, { asin: "B000DRL053", label: "20V Pro", status: "Active" },
  ]},
  { parent: "P-1007", name: "Anti-Fatigue Floor Mats", category: "Workplace", trend: "declining", children: [
    { asin: "B000MAT061", label: "24 × 36 in", status: "Active" }, { asin: "B000MAT062", label: "32 × 60 in", status: "Active" }, { asin: "B000MAT063", label: "36 × 72 in", status: "Active" },
  ]},
  { parent: "P-1008", name: "Stainless Utility Cart", category: "Material Handling", trend: "growing", children: [
    { asin: "B000CRT071", label: "2 Shelf", status: "Active" }, { asin: "B000CRT072", label: "3 Shelf", status: "Active" }, { asin: "B000CRT073", label: "3 Shelf + Drawer", status: "Active" },
  ]},
];

const baseMonths = ["Sep '25", "Oct '25", "Nov '25", "Dec '25", "Jan '26", "Feb '26", "Mar '26", "Apr '26", "May '26", "Jun '26", "Jul '26", "Aug '26"];
const exactGloveSales = [9600, 10300, 10800, 11500, 12000, 14500, 11800, 15200, 17900, 20400, 22100, 24700];

export const monthlySales = baseMonths.map((month, monthIndex) => {
  const point: Record<string, string | number> = { month };
  products.forEach((product, productIndex) => {
    const base = 8400 + productIndex * 2200;
    const direction = product.trend === "growing" ? 1 : product.trend === "declining" ? -0.62 : 0.12;
    const seasonal = [0, 350, -160, 1080, 420, 820, -240, 680, 310, 980, 520, 1240][monthIndex];
    point[product.parent] = productIndex === 0 ? exactGloveSales[monthIndex] : Math.round(base + monthIndex * 640 * direction + seasonal + productIndex * 90);
  });
  return point;
});

export const dailySales = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(2026, 6, 15 + index);
  const point: Record<string, string | number> = { date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  products.forEach((product, p) => {
    const trend = product.trend === "growing" ? index * 8 : product.trend === "declining" ? -index * 4 : index;
    point[product.parent] = Math.round(420 + p * 78 + trend + Math.sin(index * 1.7 + p) * 65);
  });
  return point;
});

export const asinChanges = [
  { id: "CHG-1048", product: "Industrial Safety Gloves", previous: "B000OLD001", current: "B000NEW001", detected: "Aug 12, 2026", confidence: 98, status: "Ready to merge" },
  { id: "CHG-1047", product: "Respirator Mask Kit", previous: "B000OLD042", current: "B000MSK042", detected: "Aug 10, 2026", confidence: 94, status: "Ready to merge" },
  { id: "CHG-1041", product: "LED Work Lights", previous: "B000LGT030", current: "B000LGT031", detected: "Jul 28, 2026", confidence: 91, status: "Merged" },
];

export const uploadHistory = [
  { file: "cdc-sales-2026-08-12.csv", rows: 2847, date: "Aug 12, 2026 · 09:42", status: "Validated", changes: 1 },
  { file: "cdc-sales-2026-08-05.csv", rows: 2694, date: "Aug 05, 2026 · 10:18", status: "Validated", changes: 0 },
  { file: "cdc-sales-2026-07-29.csv", rows: 2511, date: "Jul 29, 2026 · 09:55", status: "Validated", changes: 1 },
  { file: "cdc-sales-2026-07-22.csv", rows: 2410, date: "Jul 22, 2026 · 11:06", status: "Validated", changes: 0 },
];
