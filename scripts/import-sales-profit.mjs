import XLSX from 'xlsx';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { sealAmazonData } from '../services/amazonDataSecurity.mjs';
const file = process.argv[2];
if (!file) throw Error('Usage: node scripts/import-sales-profit.mjs <workbook.xlsx>');
const workbook = XLSX.read(await readFile(file), { type: 'buffer', cellDates: true });
const tables = {};
for (const name of workbook.SheetNames) {
  if (['Dashboard', 'Dashboard_Inputs', 'Read_Me', 'metrices_logic'].includes(name)) continue;
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null });
  const header = name === 'Listing_Snapshots' ? 7 : name === 'Sales_Forecast' ? 3 : 2;
  tables[name] = { columns: rows[header], rows: rows.slice(header + 1).filter(row => row.some(value => value !== null) && (name !== 'Product_Performance' || row[0] || row[1])) };
}
const metrics = XLSX.utils.sheet_to_json(workbook.Sheets.Dashboard_Inputs, { header: 1 }).slice(2).filter(row => row.length > 2 && row[0]).map(row => ({ label: row[0], current: row[1], previous: row[2] }));
await mkdir(join(process.cwd(), 'data-store'), { recursive: true });
const destination = join(process.cwd(), 'data-store', 'sales-profit.json');
await writeFile(destination, sealAmazonData({ source: 'Amazon_Sales_Dashboard_Provisional_Profit_Updated.xlsx', period: '17 Sep–16 Oct 2026', previousPeriod: '18 Aug–16 Sep 2026', importedAt: new Date().toISOString(), metrics, tables }, destination));
console.log(`Imported ${metrics.length} metrics and ${Object.keys(tables).length} detail sheets.`);


