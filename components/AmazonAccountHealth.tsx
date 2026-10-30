"use client";
import { useCallback, useEffect, useState } from 'react';
import { useGlobalDateRange } from './GlobalDateRange';

type Metric = { category: string; value: Record<string, any> | Record<string, any>[] };
type HealthState = { data: { capturedAt: string; marketplaceId: string; accountStatuses: { marketplaceId: string; status: string }[]; performanceMetrics: { marketplaceId: string; metrics: Metric[] }[] } | null; running: boolean; progress: { status: string; error?: string } | null };
const label = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
const percent = (rate: number) => `${(rate * 100).toFixed(2)}%`;
export default function AmazonAccountHealth() {
  const { startDate, endDate, selectedProductParents } = useGlobalDateRange();
  const globalRangeActive = Boolean(startDate && endDate && startDate <= endDate);
  const [state, setState] = useState<HealthState | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  async function exportExcel() {
    if (!state?.data) return;
    setExporting(true);
    try {
      const [{ accountHealthWorkbook }, XLSX] = await Promise.all([import('../services/accountHealthWorkbook.mjs'), import('xlsx')]);
      XLSX.writeFile(accountHealthWorkbook(state.data), `Amazon-Account-Health-${state.data.marketplaceId}-${state.data.capturedAt.slice(0, 10)}.xlsx`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Excel export failed.'); }
    finally { setExporting(false); }
  }
  const load = useCallback(async () => {
    try { const response = await fetch('/api/amazon/account-health', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) throw Error(body.error); setState(body); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Account Health unavailable.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!state?.running) return; const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [state?.running, load]);
  const metrics = state?.data?.performanceMetrics.find(item => item.marketplaceId === state.data?.marketplaceId)?.metrics || [];
  const rating = metrics.find(item => item.category === 'accountHealthRating')?.value as Record<string, any> | undefined;
  const rows = metrics.flatMap(item => {
    if (['accountHealthRating', 'warningStates', 'lateShipmentRateList'].includes(item.category)) return [];
    if (item.category === 'orderDefectRate') return Object.entries(item.value).map(([name, value]) => ({ name: `Order Defect Rate — ${name === 'afn' ? 'FBA' : 'FBM'}`, value }));
    return [{ name: label(item.category), value: item.value }];
  }).filter(row => {
    if (!globalRangeActive) return true;
    const from = row.value.reportingDateRange?.reportingDateFrom?.slice(0, 10);
    const to = row.value.reportingDateRange?.reportingDateTo?.slice(0, 10);
    return Boolean(from && to && from <= endDate && to >= startDate);
  });
  return <section aria-label="Amazon Account Health" className="account-health-panel">
    <div className="account-health-head"><div><span className="account-health-eyebrow">AMAZON DATA · ACCOUNT HEALTH</span><h2>Account health report</h2><p>Performance metrics and policy indicators saved from Amazon.</p></div><button className="account-health-export dashboard-export-button" disabled={!state?.data || exporting} onClick={() => void exportExcel()}>{exporting ? 'Exporting…' : 'Export Excel (.xlsx)'}</button></div>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {state?.running && <p role="status">Amazon is generating the report. Saved data remains visible until the pull completes.</p>}
    {state?.progress?.error && <p role="alert">{state.progress.error}</p>}
    {!state ? <p>Loading Account Health…</p> : !state.data ? <p>No saved Amazon Account Health report is available yet.</p> : <>
      <div className="account-health-summary"><div><small>Account Health Rating</small><strong>{rating?.ahrScore ?? 'Not returned'}</strong><span>{rating?.ahrStatus ?? 'Status not returned'}</span></div><div><small>Account status</small><strong>{state.data.accountStatuses.find(item => item.marketplaceId === state.data?.marketplaceId)?.status ?? 'Not returned'}</strong><span>Marketplace {state.data.marketplaceId}</span></div><div><small>Last pulled</small><strong>{new Date(state.data.capturedAt).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short',hour12:true})}</strong><span>Saved Amazon report</span></div></div>
      <p className="account-health-note">Each metric uses its own Amazon reporting period. Flagged violations need review in <a href="https://sellercentral.amazon.com/performance/dashboard" target="_blank" rel="noopener noreferrer">Seller Central</a>.</p>
      {selectedProductParents.length > 0 && <p className="account-health-note">Product selection does not narrow this report because Amazon provides Account Health metrics at seller level.</p>}
      {globalRangeActive && !rows.length && <p className="account-health-note">No saved Account Health metric overlaps the selected dashboard date range. The rating and account status above are current snapshot values.</p>}
      <div className="account-health-table-wrap"><table className="account-health-table"><thead><tr>{['Metric', 'Value', 'Status', 'Amazon target', 'Reporting period'].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{typeof row.value.rate === 'number' ? percent(row.value.rate) : row.value.defectsCount ?? row.value.warningsCount ?? 'Not returned'}</td><td className={row.value.status === 'BAD' ? 'is-bad' : ''}>{row.value.status ?? 'Not returned'}</td><td>{row.value.targetValue == null ? '—' : `${row.value.targetCondition === 'LESS_THAN' ? '<' : row.value.targetCondition === 'GREATER_THAN' ? '>' : '='} ${typeof row.value.rate === 'number' ? percent(row.value.targetValue) : row.value.targetValue}`}</td><td>{row.value.reportingDateRange ? `${row.value.reportingDateRange.reportingDateFrom.slice(0, 10)} → ${row.value.reportingDateRange.reportingDateTo.slice(0, 10)}` : 'Not returned'}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
