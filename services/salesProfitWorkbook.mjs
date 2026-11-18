import { salesProfitMetricLogic } from './salesProfitMetricLogic.mjs';
import * as XLSX from 'xlsx';
import { zipSync, unzipSync, strFromU8, strToU8 } from 'fflate';
import schema from './salesProfitExportSchema.json' with { type: 'json' };
const currency = '"$"#,##0.00;[Red]("$"#,##0.00)';
const integer = '#,##0';
const unavailable = 'Unavailable';
const change = (a, b) => typeof a === 'number' && typeof b === 'number' && b !== 0 ? a / b - 1 : unavailable;
const valueFormat = label => /margin|percentage|%/i.test(label) ? '0.00%' : /units per/i.test(label) ? '0.00' : /USD|Sales|Profit|Cost|Shipping|Promotion|Tax|Fees|Revenue|Handling|Value/i.test(label) ? currency : integer;
function append(book, name, rows, header, widths) {
  if (rows.length > 1048576) throw Error(`${name} exceeds Excel's row limit. Narrow the date range.`);
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  sheet['!cols'] = widths.map(wch => ({ wch }));
  sheet['!rows'] = rows.map((row, i) => ({ hpt: i === 0 ? 30 : i === header ? 40 : i < header ? 32 : Math.min(100, Math.max(26, ...row.map((value, c) => typeof value === 'string' ? Math.ceil(value.length / Math.max(12, widths[c] || 23)) * 14 + 8 : 26))) }));
  if (header > 0) sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: widths.length - 1 } }];
  if (rows.length > header + 1) sheet['!autofilter'] = { ref: `A${header + 1}:${XLSX.utils.encode_col(widths.length - 1)}${rows.length}` };
  sheet.exportHeader = header;
  XLSX.utils.book_append_sheet(book, sheet, name);
  return sheet;
}
const dateValue = (value, heading) => {
  if (typeof value === 'string' && /^date$/i.test(heading) && /^\d{2}\/\d{4}$/.test(value)) return new Date(value.slice(3) + '-' + value.slice(0,2) + '-01T00:00:00Z');
  if (typeof value !== 'string' || !/date|^period$|^month$|^snapshot/i.test(heading) || !/^\d{4}-\d{2}(?:-\d{2})?(?:T.*)?$/.test(value)) return value;
  const parsed = new Date(value.length === 7 ? value + '-01T00:00:00Z' : value.length === 10 ? value + 'T00:00:00Z' : value);
  return Number.isFinite(parsed.getTime()) ? parsed : value;
};
export function salesProfitWorkbook(data, { financeError = '' } = {}) {
  const book = XLSX.utils.book_new();
  const metrics = new Map(data.metrics.map(metric => [metric.label, metric]));
  const get = (label, key = 'current') => metrics.get(label)?.[key] ?? unavailable;
  const cards = [['Total Orders', 'Total Orders'], ['Actual Orders', 'Actual Orders'], ['Cancelled Orders', 'Cancelled Orders'], ['Total Units Sold', 'Units Sold'], ['Total Cost (Handling Only, Estimated)', 'Included Estimated Cost'], ['Net Sales', 'Revenue After Promotions (USD)'], ['Total Profit (Provisional)', 'Provisional Profit']];
  const other = ['Shipping Charged', 'Promotions', 'Taxes Collected', 'Handling Charges'];
  const orderMetrics = [['Total Orders', 'Total Orders'], ['Actual Orders', 'Actual Orders'], ['Cancelled Orders', 'Cancelled Orders'], ['Refund / Return Orders', 'Refund / Return Orders'], ['Total Units Sold', 'Units Sold'], ['Units per Order (USD)', 'Units per Order'], ['Active Listings', 'Active Listings'], ['Inactive Listings', 'Inactive Listings'], ['FBA orders', 'FBA orders'], ['FBM orders', 'FBM orders'], ['Handling Charges (USD)', 'Handling Charges'], ['Total Profit (USD)', 'Total Profit'], ['Profit Percentage', 'Profit Margin']];
  const revenueMetrics = [['Ordered Sales (USD)', 'Ordered Sales (Gross)'], ['Shipping Charged (USD)', 'Shipping Charged'], ['Promotions (USD)', 'Promotions'], ['Revenue After Promotions (USD)', 'Revenue After Promotions (USD)'], ['Taxes Collected (USD)', 'Taxes Collected'], ['Revenue per Unit (USD)', 'Revenue per Unit'], ['Handling Cost (Estimated $2/unit)', 'Handling Charges'], ['Operating Profit (Provisional)', 'Provisional Profit'], ['Profit Margin (Provisional)', 'Provisional Profit Margin'], ['COGS (unavailable)', 'COGS'], ['Amazon Fees (Posted USD)', 'Amazon Fees (Posted USD)']];
  const rows = [['AMAZON SALES & PROFITABILITY DASHBOARD'], ['Amazon SP-API · USD sales · Handling estimated at $2/unit; provisional profit excludes product costs, fees and refunds'], ['Account', 'CDC', null, 'Period', 'Selected dates', null, 'Selected Period', data.period, null, 'Compare With', data.previousPeriod], [], cards.flatMap(([label]) => [label, null]), cards.flatMap(([, key]) => [get(key), null]), [], [], other.flatMap(label => [label, null]), other.flatMap(label => [get(label), null]), [], [], ['ORDERS OVERVIEW', null, null, null, null, 'SALES, REVENUE & PROFITABILITY'], ['Metric', 'Current', 'Previous', 'Change (%)', null, 'Metric', 'Current', 'Previous', 'Change (%)']];
  for (let i = 0; i < Math.max(orderMetrics.length, revenueMetrics.length); i++) {
    const cells = spec => spec ? [spec[0], get(spec[1]), get(spec[1], 'previous'), /margin/i.test(spec[1]) ? typeof get(spec[1]) === 'number' && typeof get(spec[1], 'previous') === 'number' ? get(spec[1]) - get(spec[1], 'previous') : unavailable : change(get(spec[1]), get(spec[1], 'previous'))] : [null, null, null, null];
    rows.push([...cells(orderMetrics[i]), null, ...cells(revenueMetrics[i])]);
  }
  rows.push([], ['DATA AVAILABILITY & DEFINITIONS'], ...[...(data.notes || []), ...(financeError ? [`Amazon Finances pull failed: ${financeError}`] : []), `Orders last pulled: ${data.importedAt || 'Not pulled'}`, `Exported: ${new Date().toISOString()}`].map(note => [note]));
  const dash = append(book, 'Dashboard', rows, 13, [34, 22, 22, 20, 4, 43, 22, 22, 20, 16, 22, 16, 24, 16]);
  delete dash['!autofilter'];
  const merge = (r, c, end) => dash['!merges'].push({ s: { r, c }, e: { r, c: end } });
  merge(1, 0, 13); for (const c of [1, 4, 7, 10]) merge(2, c, c + 1);
  for (const r of [4, 5]) for (let c = 0; c < 14; c += 2) merge(r, c, c + 1);
  for (const r of [8, 9]) for (let c = 0; c < 8; c += 2) merge(r, c, c + 1);
  merge(12, 0, 3); merge(12, 5, 8);
  cards.forEach(([, key], i) => { const cell = dash[XLSX.utils.encode_cell({ r: 5, c: i * 2 })]; cell.z = valueFormat(key); cell.l = { Target: `#'${/Orders|Units/.test(key) ? 'Total Orders' : /Cost|Profit/.test(key) ? 'Product_Performance' : 'Daily Sales'}'!A1` }; });
  other.forEach((key, i) => { dash[XLSX.utils.encode_cell({ r: 9, c: i * 2 })].z = currency; });
  for (let i = 0; i < orderMetrics.length; i++) for (const [spec, column] of [[orderMetrics[i], 0], [revenueMetrics[i], 5]]) if (spec) for (let c = 1; c <= 3; c++) { const cell = dash[XLSX.utils.encode_cell({ r: 14 + i, c: column + c })]; if (cell) cell.z = c === 3 ? '0.0%' : valueFormat(spec[1]); }
  for (let r = 28; r < rows.length; r++) { merge(r, 0, 13); dash['!rows'][r] = { hpt: 44 }; }
  for (const spec of schema) {
    let table = data.tables[spec.name];
    if (spec.name === 'Orders_Detail') table = data.tables['Total Orders'] && { columns: data.tables['Total Orders'].columns.map(c => c === 'Purchase Date (UTC)' ? 'Purchase Date' : c === 'Item Promotion Discount' ? 'Promotion Discount' : c), rows: data.tables['Total Orders'].rows };
    const aliases = { 'Snapshot Date/Time': 'Snapshot Date', 'Ordered Sales': 'Ordered Sales (USD)', 'Net Sales': 'Revenue After Promotions (USD)', 'Month': 'Period' };
    let body = table ? table.rows.map(row => spec.columns.map(heading => { const c = table.columns.indexOf(heading); const fallback = table.columns.indexOf(aliases[heading]); const value = row[c >= 0 ? c : fallback]; const typed = typeof value === 'string' && value.trim() !== '' && /Quantity|^Units|Orders Placed|Orders$|Order Count|Order Lines|Price|Tax|Discount|Cost|Sales|Revenue|Profit|Fees|Handling|Amount|Adjustments|Days Inactive/i.test(heading) && Number.isFinite(Number(value)) ? Number(value) : value;
      return dateValue(typed ?? unavailable, heading); })) : [];
    if (spec.name === 'Period_Trends') body = (data.tables['Monthly Sales']?.rows || []).map(row => { const cols = data.tables['Monthly Sales'].columns; const v = key => row[cols.indexOf(key)]; return [dateValue(v('Period'), 'Month'), v('Revenue After Promotions (USD)'), unavailable, unavailable, data.tables['Actual Order Records']?.available ? data.tables['Actual Order Records'].rows.filter(record => String(record[1]).slice(0, 7) === String(v('Period')).slice(0, 7)).length : unavailable, v('Units Sold (USD)')]; });
    if (spec.name === 'Sales_Forecast') body = (data.tables['Monthly Sales']?.rows || []).map(row => { const cols = data.tables['Monthly Sales'].columns; return [dateValue(row[0], 'Month'), row[cols.indexOf('Revenue After Promotions (USD)')], unavailable, unavailable, unavailable, 'Actual selected-date revenue only; no forecast supplied by Amazon']; });
    if (spec.name === 'Dashboard_Inputs') body = data.metrics.map(metric => [metric.label, metric.current, metric.previous, /margin/i.test(metric.label) ? typeof metric.current === 'number' && typeof metric.previous === 'number' ? metric.current - metric.previous : unavailable : change(metric.current, metric.previous), unavailable]);
    if (spec.name === 'metrices_logic') body = salesProfitMetricLogic;
    if (spec.name === 'Read_Me') body = [['Source', 'Amazon SP-API saved reports'], ['Period', data.period], ['Previous period', data.previousPeriod], ['Orders pulled', data.importedAt || 'Not pulled'], ['Finance status', financeError || 'See financial transactions and coverage notes'], ['Export scope', 'All records in selected dates. Screen search and pagination do not limit this workbook.'], ['Charts', 'Omitted'], ...data.notes.map(note => ['Definition / availability', note])];
    if (!body.length) body = [[table ? 'No matching Amazon records in selected dates. See Read_Me for availability.' : 'Unavailable: this input/forecast is not supplied by Amazon. No reference-workbook values have been copied.']];
    const headingRows = Array.from({ length: spec.headerRow }, (_, i) => i === 0 ? [spec.title] : i === 1 ? [`Amazon SP-API · ${data.period}`] : []);
    const widths = spec.columns.map((heading, i) => /name|description|notes|details|formula/i.test(heading) ? 60 : Math.max(18, Math.min(spec.widths[i] || 23, 40)));
    const sheet = append(book, spec.name, [...headingRows, spec.columns, ...body], spec.headerRow, widths);
    for (let r = spec.headerRow + 1; r <= spec.headerRow + body.length; r++) for (let c = 0; c < spec.columns.length; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]; if (!cell) continue;
      const heading = spec.columns[c];
      if (cell.t === 'd') cell.z = /^month/i.test(heading) || spec.name === 'Monthly Sales' ? 'mmm yyyy' : 'dd-mmm-yyyy';
      else if (cell.t === 'n') cell.z = /change|margin|adjustment %/i.test(heading) ? '0.00%' : /USD|Price|Tax|Discount|Cost|Sales|Revenue|Profit|Fees|Handling|Amount|Adjustments/i.test(heading) && !/Orders|Order Lines|Order Count|Units/.test(heading) ? currency : integer;
      if (['Total Orders', 'Orders_Detail'].includes(spec.name) && cell.t === 'n' && /Price|Tax|Discount/.test(heading)) {
        const source = data.tables['Total Orders'];
        const code = source?.rows[r - spec.headerRow - 1]?.[source.columns.indexOf('Currency')];
        if (typeof code === 'string' && /^[A-Z]{3}$/.test(code) && code !== 'USD') cell.z = '"' + code + '" #,##0.00';
      }
      if (spec.name === 'Dashboard_Inputs' && c > 0 && c < 3 && cell.t === 'n') cell.z = valueFormat(body[r - spec.headerRow - 1][0]);
    }
  }
  // Finance detail sheets follow the reference tabs, preserving the original tab sequence.
  for (const name of ['Financial Transactions', 'Refund Transactions', 'Financial Breakdown', 'Legacy Financial Events', 'Actual Order Records', 'Refunded Order Records', 'Inventory Ledger History']) {
    const table = data.tables[name]; if (!table) continue;
    const sheet = append(book, name, [[name], [financeError || `Amazon posted-date transactions · ${data.period}`], table.columns, ...table.rows.map(row => row.map((v, c) => dateValue(typeof v === 'string' && v.trim() !== '' && /Quantity|Price|Tax|Discount|Amount|Units|Balance|Receipts|Returns|Found|Lost|Damaged|Disposed|Events/.test(table.columns[c]) && Number.isFinite(Number(v)) ? Number(v) : v ?? unavailable, table.columns[c])))], 2, table.columns.map(c => /Breakdown/.test(c) ? 60 : 26));
    for (const [address, cell] of Object.entries(sheet)) if (!address.startsWith('!') && typeof cell === 'object') { if (cell.t === 'd') cell.z = name === 'Inventory Ledger History' ? 'mmm yyyy' : 'dd-mmm-yyyy hh:mm'; else if (cell.t === 'n') cell.z = /Quantity|Units|Balance|Receipts|Returns|Found|Lost|Damaged|Disposed|Events/.test(table.columns[XLSX.utils.decode_cell(address).c]) ? '#,##0' : '#,##0.00'; }
  }
  return book;
}
export function writeSalesProfitWorkbook(book) {
  const files = unzipSync(new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true })));
  let styles = strFromU8(files['xl/styles.xml']);
  const fonts = Number(styles.match(/<fonts count="(\d+)"/)[1]), fills = Number(styles.match(/<fills count="(\d+)"/)[1]), xfs = Number(styles.match(/<cellXfs count="(\d+)"/)[1]);
  styles = styles.replace(/<fonts count="\d+"/, `<fonts count="${fonts + 1}"`).replace('</fonts>', '<font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><b/></font></fonts>');
  styles = styles.replace(/<fills count="\d+"/, `<fills count="${fills + 1}"`).replace('</fills>', '<fill><patternFill patternType="solid"><fgColor rgb="FF193B60"/><bgColor indexed="64"/></patternFill></fill></fills>');
  styles = styles.replace(/<cellXfs count="\d+"/, `<cellXfs count="${xfs + 1}"`).replace('</cellXfs>', `<xf numFmtId="0" fontId="${fonts}" fillId="${fills}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>`);
  styles = styles.replace(/<cellXfs([^>]*)>([\s\S]*?)<\/cellXfs>/, (_, attrs, entries) => '<cellXfs' + attrs + '>' + entries.replace(/<xf([^>]*?)\/>/g, (_match, xf) => '<xf' + xf + ' applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>') + '</cellXfs>');
  files['xl/styles.xml'] = strToU8(styles);
  book.SheetNames.forEach((name, i) => {
    const key = `xl/worksheets/sheet${i + 1}.xml`, header = book.Sheets[name].exportHeader;
    let xml = strFromU8(files[key]);
    const freeze = name === 'Dashboard' ? 14 : header + 1;
    const view = `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`;
    xml = /<sheetViews>/.test(xml) ? xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, view) : xml.replace('<sheetData>', view + '<sheetData>');
    const styled = name === 'Dashboard' ? [1, 5, 9, 13, 14, 29] : [1, header + 1];
    xml = xml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (match, r, attrs, cells) => styled.includes(Number(r)) ? `<row r="${r}"${attrs}>${cells.replace(/<c\b([^>]*)>/g, (_, a) => `<c${a.replace(/ s="\d+"/, '')} s="${xfs}">`)}</row>` : match);
    files[key] = strToU8(xml);
  });
  return zipSync(files, { level: 6 });
}
