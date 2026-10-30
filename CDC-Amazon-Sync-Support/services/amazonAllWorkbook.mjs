import path from 'node:path';
import * as XLSX from 'xlsx';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { monitorRoot, monitorState, readJson } from './amazonMonitorStore.mjs';
import { readAmazonJson } from './amazonDataSecurity.mjs';
import { accountHealthWorkbook } from './accountHealthWorkbook.mjs';

const scalar = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value;
export function flattenExport(value, prefix = '', result = {}) {
  for (const [key, child] of Object.entries(value || {})) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flattenExport(child, field, result);
    else {
      const text = Array.isArray(child) && child.every(item => typeof item !== 'object') ? child.join('\n') : scalar(child);
      if (typeof text === 'string' && text.length > 32767) for (let offset = 0; offset < text.length; offset += 32000) result[`${field} (part ${offset / 32000 + 1})`] = text.slice(offset, offset + 32000);
      else result[field] = text;
    }
  }
  return result;
}
const identity = row => String(row.sku || row.SKU || row['seller-sku'] || row.sellerSku || row['Merchant SKU'] || row.asin || row.ASIN || '');
const chronology = row => String(row['purchase-date'] || row['return-date'] || row.PostedDate || row['value.PostedDate'] || row.detectedAt || row.capturedAt || row.interval || '');
export function inventoryExportRow(product) {
  const { parentAsins = [], childAsins = [], ...rest } = product;
  const isChild = product.parentage === 'Child' || parentAsins.length > 0;
  return { ...rest, 'Child ASIN': isChild ? product.asin : product.parentage === 'Parent' ? 'Not applicable (parent listing)' : 'Not confirmed', 'Parent ASIN': parentAsins.join('\n'), 'Child ASINs': childAsins.join('\n') };
}
export function appendExportTable(book, name, input, preferred = []) {
  const rows = input.map(row => flattenExport(row));
  rows.sort((a, b) => chronology(b).localeCompare(chronology(a)) || identity(a).localeCompare(identity(b), 'en', { numeric: true }));
  const fields = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const headers = [...preferred.filter(field => fields.includes(field)), ...fields.filter(field => !preferred.includes(field))];
  if (!headers.length) headers.push('Status');
  if (headers.length > 16384 || rows.length > 1048575) throw Error('Dataset exceeds Excel limits; export cannot safely omit data.');
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map(row => headers.map(field => row[field] ?? ''))]);
  sheet['!cols'] = headers.map(field => ({ wch: /name|title|description|message|attributes|images|issues/i.test(field) ? 48 : /date|time|period/i.test(field) ? 27 : Math.min(35, Math.max(18, field.length + 2)) }));
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  XLSX.utils.book_append_sheet(book, sheet, name);
  return rows.length;
}
export async function buildAmazonAllWorkbook() {
  const book = XLSX.utils.book_new(); const manifest = []; const source = path.join(process.cwd(), 'outputs', 'amazon-cdc');
  const read = async (file, label) => { try { return await readAmazonJson(file); } catch { manifest.push({ Dataset: label, Status: 'Unavailable', Note: 'Saved source could not be read securely. No rows exported from this source.' }); return null; } };
  const state = await monitorState();
  const [report, orders, health] = await Promise.all([read(path.join(source, 'order-report.json'), 'Orders report'), read(path.join(source, 'orders.json'), 'Orders API'), read(path.join(monitorRoot(), 'account-health.json'), 'Account Health')]);
  const orderRows = report?.rows || orders?.rows || orders?.payload?.Orders || [];
  const add = (name, rows, capturedAt, note = '', preferred = []) => { const count = appendExportTable(book, name, rows, preferred); manifest.push({ Dataset: name, Status: count ? 'Exported' : 'No saved rows', Rows: count, 'Captured at (UTC)': capturedAt || '', Note: note }); };
  add('Orders', orderRows, report?.pulledAt || orders?.pulledAt, 'All saved order rows; unaffected by screen search/review filters.', ['amazon-order-id', 'merchant-order-id', 'purchase-date', 'last-updated-date', 'order-status', 'fulfillment-channel', 'sales-channel', 'ship-service-level', 'product-name', 'sku', 'asin', 'item-status', 'quantity', 'currency', 'item-price']);
  if (report?.rows && orders?.payload?.Orders) add('Orders API', orders.payload.Orders, orders.pulledAt, orders.payload.NextToken ? 'Saved Orders API snapshot has more pages not yet pulled.' : 'Saved order-level API fields, separate from report line items.');
  add('Inventory', (state.run?.products || []).map(inventoryExportRow), state.run?.capturedAt, 'Child ASIN is the child listing; Child ASINs lists the children of a parent.', ['sku', 'asin', 'Child ASIN', 'Parent ASIN', 'title', 'parentage', 'Child ASINs', 'listing.price', 'listing.quantity', 'listing.status']);
  if (health) {
    const healthBook = accountHealthWorkbook(health);
    for (const [old, name] of [['Summary', 'Account Health Summary'], ['Metrics', 'Metrics'], ['Returned Details', 'Returned Details']]) XLSX.utils.book_append_sheet(book, healthBook.Sheets[old], name);
    manifest.push({ Dataset: 'Account Health', Status: 'Exported', 'Captured at (UTC)': health.capturedAt, Note: 'Returned Details contains the source Account Health fields.' });
  } else add('Account Health Summary', [{ Status: 'No saved Account Health report available' }]);
  add('Product Changes', state.changes || [], state.run?.capturedAt, 'All saved changes, including reviewed rows.', ['detectedAt', 'sku', 'asin', 'field', 'previous', 'current', 'priority', 'status']);
  add('Sync History', state.history || []);
  appendExportTable(book, 'Export Overview', manifest, ['Dataset', 'Status', 'Rows', 'Captured at (UTC)', 'Note']);
  book.SheetNames = ['Export Overview', ...book.SheetNames.filter(name => name !== 'Export Overview')];
  return book;
}

export function writeAmazonAllWorkbook(book) {
  const files = unzipSync(new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true })));
  // Native OOXML header formatting and frozen panes, supported by Excel and Google Sheets.
  let styles = strFromU8(files['xl/styles.xml']);
  const fonts = Number(styles.match(/<fonts count="(\d+)"/)?.[1]);
  const fills = Number(styles.match(/<fills count="(\d+)"/)?.[1]);
  const xfs = Number(styles.match(/<cellXfs count="(\d+)"/)?.[1]);
  styles = styles.replace(/<fonts count="\d+"/, `<fonts count="${fonts + 1}"`).replace('</fonts>', '<font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><b/></font></fonts>');
  styles = styles.replace(/<fills count="\d+"/, `<fills count="${fills + 1}"`).replace('</fills>', '<fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill></fills>');
  styles = styles.replace(/<cellXfs count="\d+"/, `<cellXfs count="${xfs + 1}"`).replace('</cellXfs>', `<xf numFmtId="0" fontId="${fonts}" fillId="${fills}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>`);
  files['xl/styles.xml'] = strToU8(styles);
  for (const key of Object.keys(files).filter(key => /^xl\/worksheets\/sheet\d+\.xml$/.test(key))) {
    let xml = strFromU8(files[key]);
    xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B2" sqref="B2"/></sheetView></sheetViews>');
    xml = xml.replace(/<row r="1"[^>]*>([\s\S]*?)<\/row>/, (_, cells) => `<row r="1" ht="32" customHeight="1">${cells.replace(/<c\b([^>]*)>/g, (_match, attrs) => `<c${attrs.replace(/ s="\d+"/, '')} s="${xfs}">`)}</row>`);
    files[key] = strToU8(xml);
  }
  return zipSync(files, { level: 6 });
}
