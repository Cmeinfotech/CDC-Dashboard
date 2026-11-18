import { matchesSalesProfitFilter } from './salesProfitViewFilter.mjs';
export function salesProfitView(data, params) {
  const sheets = Object.keys(data.tables).map(name => ({ name }));
  const name = params.get('sheet');
  if (!name) return { source: data.source, period: data.period, previousPeriod: data.previousPeriod, importedAt: data.importedAt, metrics: data.metrics, sheets };
  if (!Object.hasOwn(data.tables, name)) return null;
  const table = data.tables[name];
  const search = (params.get('search') || '').trim().toLowerCase();
  const filter = params.get('filter') || '';
  const rows = table.rows.filter(row => (!search || row.some(cell => String(cell ?? '').toLowerCase().includes(search))) && matchesSalesProfitFilter(row, name, filter));
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1));
  return { name, columns: table.columns, rows: rows.slice((page - 1) * 50, page * 50), total: rows.length, page, pages, period: data.period };
}
