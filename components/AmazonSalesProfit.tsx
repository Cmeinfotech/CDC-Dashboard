'use client';
import { useEffect, useState } from 'react';
import KpiCard from './KpiCard';
import { formatSalesProfitValue as format } from '../services/salesProfitPresentation.mjs';
import SalesProfitComparisonChart from './SalesProfitComparisonChart';
import SalesProfitFulfillmentChart from './SalesProfitFulfillmentChart';
import Link from 'next/link';
import { RefreshCw, Download, SlidersHorizontal } from 'lucide-react';
import { useGlobalDateRange } from './GlobalDateRange';

type Metric = { label: string; current: string | number; previous: string | number };
type Meta = { financeError?: string; notes?: string[]; importedAt?: string; financeUpdatedAt?: string; running?: boolean; progress?: { status: string; jobs?: { name: string; status: string; error?: string }[] } };
type Summary = Meta & { period: string; previousPeriod: string; metrics: Metric[]; sheets: { name: string; total: number }[] };
type Detail = Meta & { name: string; columns: string[]; rows: (string | number | null)[][]; total: number; page: number; pages: number; period: string };

function detailColumn(heading: string) {
  if (/product name|title|notes|formula|source fields|returned source/i.test(heading)) return 'detail-text';
  if (/quantity|units|price|tax|discount|amount|cost|profit|margin|sales|revenue|order lines|orders placed|order count/i.test(heading) && !/order id|status|channel|name/i.test(heading)) return 'detail-number';
  if (/status/i.test(heading)) return 'detail-status';
  return 'detail-identifier';
}
function detailValue(value: string | number | null, heading: string, row: (string | number | null)[], columns: string[]) {
  if (value === '' && /^(Shipping Price|Item Tax|Shipping Tax|Item Promotion Discount|Ship Promotion Discount|Gift Wrap Price|Gift Wrap Tax)$/.test(heading)) value = 0;
  if (value == null || value === '') return detailColumn(heading) === 'detail-number' ? 'Not reported' : '—';
  if (/date|^period$|^month$/i.test(heading) && typeof value === 'string' && /^\d{4}-\d{2}/.test(value)) {
    const parsed = new Date(value); if (Number.isFinite(parsed.getTime())) return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  if (detailColumn(heading) === 'detail-number' && Number.isFinite(Number(value))) {
    const number = Number(value);
    if (/margin|%/i.test(heading)) return (number * 100).toFixed(2) + '%';
    if (/price|tax|discount|amount|cost|profit|sales|revenue/i.test(heading)) {
      const currency = String(row[columns.indexOf('Currency')] || 'USD');
      return number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (/^[A-Z]{3}$/.test(currency) ? ' ' + currency : '');
    }
    return number.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return String(value);
}

function target(label: string) {
  const sheet = /^(Orders Before Refunds|Units per Order \(Before Refunds\))$/.test(label) ? 'Total Orders' : label === 'Actual Orders' || label === 'Units per Order' ? 'Actual Order Records' : label === 'Refund / Return Orders' ? 'Refunded Order Records' : /Refund/.test(label) ? 'Refund Transactions' : /Fees/.test(label) ? 'Financial Breakdown' : /Listings/.test(label) ? 'Listing_Snapshots' : /Profit|Cost|Expenses|Fees|COGS|Handling/i.test(label) ? 'Product_Performance' : /Orders|orders|Units/.test(label) ? 'Total Orders' : 'Daily Sales';
  return `/amazon/sales-profit/details?${new URLSearchParams({ sheet, metric: label, ...(/Active & In-Stock/.test(label) ? { filter: 'stock-in' } : /Active & Out-of-Stock/.test(label) ? { filter: 'stock-out' } : label === 'Active Listings' ? { filter: 'active-listings' } : label === 'Inactive Listings' ? { filter: 'inactive-listings' } : label === 'FBA orders' ? { filter: 'fba' } : label === 'FBM orders' ? { filter: 'fbm' } : /Cancelled Orders/.test(label) ? { filter: 'cancelled' } : /Actual Orders|Orders Before Refunds|Units per Order \(Before Refunds\)/.test(label) ? { filter: 'actual' } : {}) })}`;
}
export default function AmazonSalesProfit({ details = false }: { details?: boolean }) {
  const { startDate: appliedStart, endDate: appliedEnd, availableRange } = useGlobalDateRange();
  const startDate = appliedStart || availableRange.startDate;
  const endDate = appliedEnd || availableRange.endDate;
  const detailSheet = details ? new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('sheet') || 'Daily Sales' : '';
  const [refresh, setRefresh] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [table, setTable] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const params = details ? new URLSearchParams(window.location.search) : new URLSearchParams();
    params.delete('startDate'); params.delete('endDate');
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (details) { params.set('page', String(page)); }
    fetch(`/api/amazon/sales-profit?${params}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]), cache: 'no-store' }).then(async response => {
      const body = await response.json(); if (!response.ok) throw Error(body.error);
      if (details) setTable(body); else setSummary(body); setError('');
    }).catch(caught => { if (!controller.signal.aborted) { setError(caught.message === 'Failed to fetch' ? 'Server connection lost. Restart the server and retry.' : caught.message); setSummary(current => current ? { ...current, running: false } : current); setTable(current => current ? { ...current, running: false } : current); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [details, detailSheet, page, startDate, endDate, refresh]);
  const meta = details ? table : summary;
  useEffect(() => {
    if (!meta?.running && !pulling) return;
    const timer = window.setInterval(() => setRefresh(value => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [meta?.running, pulling]);
  async function pullLatest() {
    setPulling(true);
    try {
      const response = await fetch('/api/amazon/sales-profit?' + new URLSearchParams({ startDate, endDate }), { method: 'POST' });
      const body = await response.json(); if (!response.ok) throw Error(body.error);
      setRefresh(value => value + 1);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Amazon pull failed.'); }
    finally { setPulling(false); }
  }
  async function exportExcel() {
    setExporting(true);
    try {
      const response = await fetch('/api/amazon/sales-profit?' + new URLSearchParams({ startDate, endDate, format: 'xlsx' }), { cache: 'no-store' });
      if (!response.ok) { const body = await response.json(); throw Error(body.error || 'Excel export failed.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url;
      link.download = 'Amazon-Sales-Profit-' + (startDate || 'latest') + '-' + (endDate || 'latest') + '.xlsx';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Excel export failed.'); }
    finally { setExporting(false); }
  }
  const metrics = summary?.metrics || [];
  const salesSheets = ['Daily Sales', 'Weekly Sales', 'Monthly Sales', 'Daily Product Sales', 'Monthly Product Sales'];
  const salesSheetLabel = (sheet: string) => sheet.replace(' Sales', '');
  const salesSheetHref = (sheet: string) => `/amazon/sales-profit/details?${new URLSearchParams({ sheet, metric: 'Ordered Sales (Gross)', ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) })}`;
  const cards = ['Total Orders', 'Actual Orders', 'Cancelled Orders', 'Units Sold', 'Ordered Sales (Gross)', 'Included Estimated Cost', 'Revenue After Promotions (USD)', 'Provisional Profit', 'Shipping Charged', 'Promotions', 'Taxes Collected', 'Handling Charges'];
  const labels: Record<string, string> = { 'Units Sold': 'Total Units Sold', 'Ordered Sales (Gross)': 'Total Sales', 'Total Cost': 'Total Cost', 'Revenue After Promotions (USD)': 'Net Sales', 'Total Profit': 'Total Profit', 'Taxes Collected': 'Taxes Collected (Reported)', 'Amazon Fees (Posted USD)': 'Amazon Fees (Dated USD)', 'Refunds (Posted USD)': 'Refunds (Dated USD)', 'Orders Before Refunds': 'Orders (Before Refunds)', 'Included Estimated Cost': 'Total Cost (Estimated)', 'Provisional Profit': 'Total Profit (Provisional)', 'Handling Charges': 'Handling Charges (Est. $2/unit)' };
  const comparison = (title: string, rows: Metric[]) => <SalesProfitComparisonChart title={title} metrics={rows} period={summary?.period || ''} previousPeriod={summary?.previousPeriod || ''} format={format} href={target} labels={labels} />;
  return <section className={`account-health-panel sales-profit-panel${details ? ' sales-profit-details' : ''}`}>
    {details && <Link className="account-health-back" href="/?page=salesProfit">← Back to Sales & Profit</Link>}
    <div className="account-health-head"><h2>{details ? (salesSheets.includes(detailSheet) ? (detailSheet.includes('Product') ? 'Product Sales' : 'Sales') : detailSheet) : 'Sales & Profit dashboard'}</h2><div className="account-health-actions">{details && <button type="button" className={`sales-detail-filter-button${filterOpen ? ' active' : ''}`} onClick={() => setFilterOpen(value => !value)} aria-label="Open sales filters" title="Sales filters" aria-expanded={filterOpen}><SlidersHorizontal size={16} /></button>}<button className="account-health-export dashboard-export-button" disabled={pulling || meta?.running} onClick={() => void pullLatest()}><RefreshCw size={14} aria-hidden="true" />{pulling || meta?.running ? 'Pulling from Amazon…' : 'Pull latest from Amazon'}</button><button className="account-health-export dashboard-export-button" disabled={!meta || exporting || pulling || meta?.running} onClick={() => void exportExcel()}><Download size={14} aria-hidden="true" />{exporting ? 'Exporting…' : 'Export Excel (.xlsx)'}</button></div></div>
    {details && filterOpen && <div className="sales-sheet-filter-menu" role="menu"><span className="sales-sheet-filter-heading">Sales sheets</span>{salesSheets.map(sheet => <Link key={sheet} role="menuitem" className={detailSheet === sheet ? 'active' : ''} href={salesSheetHref(sheet)}>{salesSheetLabel(sheet)}</Link>)}</div>}
    {error && <p role="alert" className="account-health-error">{error}</p>}
    {loading && <p role="status">Loading Amazon sales data…</p>}
    {details ? <>
      {/* The overflow region is focusable so keyboard users can scroll wide tables. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      {table && <><p className="sales-detail-count">{table.total.toLocaleString()} rows{table.name === 'Total Orders' && ' · order-item rows (not distinct order count)'}{table.name === 'Product_Performance' && ' · Provisional profit = revenue after promotions minus estimated $2/unit handling. Excludes purchase costs, Amazon fees, refunds and other costs.'}</p><div className="account-health-table-wrap sales-detail-scroll" role="region" aria-label="Sales and profit detail table" tabIndex={0}><table className="account-health-table account-health-sheet-table sales-detail-table"><thead><tr>{table.columns.map((column, i) => <th key={i} scope="col" className={detailColumn(column)}>{column}</th>)}</tr></thead><tbody>{table.rows.length ? table.rows.map((row, i) => <tr key={i}>{table.columns.map((heading, c) => <td key={c} className={detailColumn(heading)}>{detailColumn(heading) === 'detail-status' ? <span className={/cancel/i.test(String(row[c])) ? 'sales-status cancelled' : 'sales-status'}>{detailValue(row[c], heading, row, table.columns)}</span> : detailValue(row[c], heading, row, table.columns)}</td>)}</tr>) : <tr><td colSpan={table.columns.length}>No saved Amazon records match this view. Pull latest from Amazon to refresh.</td></tr>}</tbody></table></div><nav className="account-health-pagination" aria-label="Sheet pagination"><button disabled={table.page <= 1 || loading} onClick={() => { setLoading(true); setPage(table.page - 1); }}>Previous</button><span>Page {table.page} of {table.pages}</span><button disabled={table.page >= table.pages || loading} onClick={() => { setLoading(true); setPage(table.page + 1); }}>Next</button></nav></>}
    </> : summary && <>
      <div className="sales-profit-kpis">{cards.map(label => { const metric = metrics.find(item => item.label === label); return metric && <KpiCard key={label} className={label === 'Cancelled Orders' ? 'sales-kpi-cancelled' : ''} title={labels[label] || label} count={format(metric, metric.current)} onClick={['Shipping Charged', 'Promotions', 'Taxes Collected', 'Handling Charges'].includes(label) ? undefined : () => { window.location.href = target(label); }} />; })}</div>
      <div className="account-health-table-pair sales-profit-comparisons">{comparison('Orders Overview', metrics.filter(metric => /Orders|orders|Units|Listings|Average Order|In-Stock %/.test(metric.label)))}{comparison('Sales, Revenue & Profitability', metrics.filter(metric => !/Orders|orders|Units|Listings|Average Order|In-Stock %/.test(metric.label) && !['Total Cost', 'Total Profit', 'Profit Margin'].includes(metric.label)))}</div>
      <SalesProfitFulfillmentChart metrics={metrics} period={summary?.period || ''} previousPeriod={summary?.previousPeriod || ''} />
    </>}
  </section>;
}




