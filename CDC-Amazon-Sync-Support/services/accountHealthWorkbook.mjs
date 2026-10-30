import * as XLSX from 'xlsx';

const title = name => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
export function accountHealthWorkbook(data) {
  if (!data?.capturedAt || !Array.isArray(data.performanceMetrics)) throw Error('No saved Account Health report to export.');
  const workbook = XLSX.utils.book_new();
  const append = (name, rows, widths, filter = false) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = widths.map(wch => ({ wch }));
    if (filter && rows.length > 1) sheet['!autofilter'] = { ref: sheet['!ref'] };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
    return sheet;
  };
  const summary = [['Amazon Account Health'], ['Source', 'Amazon SP-API', data.reportType], ['Report ID', data.reportId ?? 'Not returned'], ['Captured at (UTC)', data.capturedAt], ['Note', 'Each metric uses its own Amazon reporting period.'], [], ['Marketplace', 'Account status', 'AHR score', 'AHR status']];
  for (const item of data.performanceMetrics) {
    const rating = item.metrics.find(metric => metric.category === 'accountHealthRating')?.value;
    summary.push([item.marketplaceId, data.accountStatuses?.find(status => status.marketplaceId === item.marketplaceId)?.status ?? 'Not returned', rating?.ahrScore ?? 'Not returned', rating?.ahrStatus ?? 'Not returned']);
  }
  append('Summary', summary, [30, 65, 45, 24]);
  const rows = [['Marketplace', 'Metric', 'Breakdown', 'Value', 'Unit', 'Status', 'Target', 'Target condition', 'Period from (UTC)', 'Period to (UTC)']];
  const details = [['Marketplace', 'Metric', 'Field', 'Value']];
  function flatten(marketplace, category, value, prefix = '') {
    if (value !== null && typeof value === 'object') {
      const entries = Object.entries(value);
      if (!entries.length) details.push([marketplace, category, prefix, Array.isArray(value) ? '[]' : '{}']);
      for (const [key, child] of entries) flatten(marketplace, category, child, prefix ? `${prefix}.${key}` : key);
    } else details.push([marketplace, category, prefix, value ?? 'Not returned']);
  }
  for (const item of data.performanceMetrics) for (const metric of item.metrics) {
    flatten(item.marketplaceId, metric.category, metric.value);
    if (['accountHealthRating', 'warningStates'].includes(metric.category)) continue;
    const variants = metric.category === 'orderDefectRate' ? Object.entries(metric.value).map(([key, value]) => [key === 'afn' ? 'FBA' : key === 'mfn' ? 'FBM' : key, value]) : Array.isArray(metric.value) ? metric.value.map((value, i) => [`Period ${i + 1}`, value]) : [['', metric.value]];
    for (const [breakdown, value] of variants) {
      const rate = typeof value.rate === 'number';
      rows.push([item.marketplaceId, title(metric.category), breakdown, rate ? value.rate : value.defectsCount ?? value.warningsCount ?? 'Not returned', rate ? 'Percentage' : 'Count', value.status ?? 'Not returned', value.targetValue ?? 'Not returned', value.targetCondition ?? 'Not returned', value.reportingDateRange?.reportingDateFrom ?? 'Not returned', value.reportingDateRange?.reportingDateTo ?? 'Not returned']);
    }
  }
  const sheet = append('Metrics', rows, [25, 52, 18, 16, 16, 18, 16, 24, 28, 28], true);
  rows.slice(1).forEach((row, index) => { if (row[4] === 'Percentage') for (const col of ['D', 'G']) { const cell = sheet[`${col}${index + 2}`]; if (cell?.t === 'n') cell.z = '0.00%'; } });
  append('Returned Details', details, [25, 52, 65, 35], true);
  return workbook;
}
