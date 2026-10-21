"use client";
import { useCallback, useEffect, useState } from 'react';

type Metric = { category: string; value: Record<string, any> | Record<string, any>[] };
type HealthState = { data: { capturedAt: string; marketplaceId: string; accountStatuses: { marketplaceId: string; status: string }[]; performanceMetrics: { marketplaceId: string; metrics: Metric[] }[] } | null; running: boolean; progress: { status: string; error?: string } | null };
const label = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
const percent = (rate: number) => `${(rate * 100).toFixed(2)}%`;
export default function AmazonAccountHealth() {
  const [state, setState] = useState<HealthState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
  useEffect(() => { if (!busy && !state?.running) return; const timer = window.setInterval(() => void load(), 5000); return () => window.clearInterval(timer); }, [busy, state?.running, load]);
  async function pull() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/amazon/account-health', { method: 'POST' }); const body = await response.json(); if (!response.ok) throw Error(body.error);
      setState(previous => previous ? { ...previous, running: true } : { data: null, progress: null, running: true });
    } catch (e) { setError(e instanceof Error ? e.message : 'Pull failed.'); }
    finally { setBusy(false); }
  }
  const metrics = state?.data?.performanceMetrics.find(item => item.marketplaceId === state.data?.marketplaceId)?.metrics || [];
  const rating = metrics.find(item => item.category === 'accountHealthRating')?.value as Record<string, any> | undefined;
  const rows = metrics.flatMap(item => {
    if (['accountHealthRating', 'warningStates', 'lateShipmentRateList'].includes(item.category)) return [];
    if (item.category === 'orderDefectRate') return Object.entries(item.value).map(([name, value]) => ({ name: `Order Defect Rate — ${name === 'afn' ? 'FBA' : 'FBM'}`, value }));
    return [{ name: label(item.category), value: item.value }];
  });
  const cell = { padding: '12px', borderBottom: '1px solid #e4e9f1', textAlign: 'left' as const };
  return <section aria-label="Amazon Account Health" style={{ padding: 20, border: '1px solid #dde5ef', borderRadius: 12, background: 'white', marginBottom: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><h2>Amazon Account Health</h2><button className="btn" disabled={busy || state?.running} onClick={() => void pull()}>{busy || state?.running ? 'Pulling Account Health…' : 'Pull Account Health'}</button></div>
    <button className="btn" disabled={!state?.data || exporting} onClick={() => void exportExcel()} style={{ marginTop: 12, padding: '10px 18px', background: '#2554cf', color: 'white', border: '1px solid #2554cf', borderRadius: 8, fontWeight: 600, cursor: !state?.data || exporting ? 'not-allowed' : 'pointer', opacity: !state?.data || exporting ? 0.5 : 1 }}>{exporting ? 'Exporting…' : 'Export Excel (.xlsx)'}</button>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {state?.running && <p role="status">Amazon is generating the report. Saved data remains visible until the pull completes.</p>}
    {state?.progress?.error && <p role="alert">{state.progress.error}</p>}
    {!state ? <p>Loading Account Health…</p> : !state.data ? <p>No saved Account Health report. Select Pull Account Health to fetch it.</p> : <>
      <p><strong>AHR: {rating?.ahrScore ?? 'Not returned'} · {rating?.ahrStatus ?? 'Not returned'}</strong> · Account: {state.data.accountStatuses.find(item => item.marketplaceId === state.data?.marketplaceId)?.status ?? 'Not returned'}</p>
      <p>Marketplace: {state.data.marketplaceId} · Last pulled: {new Date(state.data.capturedAt).toLocaleString()}</p>
      <p>Each metric uses its own Amazon reporting period. Flagged violations need review in <a href="https://sellercentral.amazon.com/performance/dashboard" target="_blank" rel="noopener noreferrer">Seller Central</a>.</p>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['Metric', 'Value', 'Status', 'Amazon target', 'Reporting period'].map(title => <th key={title} style={cell}>{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.name}><td style={cell}>{row.name}</td><td style={cell}>{typeof row.value.rate === 'number' ? percent(row.value.rate) : row.value.defectsCount ?? row.value.warningsCount ?? 'Not returned'}</td><td style={{ ...cell, color: row.value.status === 'BAD' ? '#b42318' : undefined }}>{row.value.status ?? 'Not returned'}</td><td style={cell}>{row.value.targetValue == null ? '—' : `${row.value.targetCondition === 'LESS_THAN' ? '<' : row.value.targetCondition === 'GREATER_THAN' ? '>' : '='} ${typeof row.value.rate === 'number' ? percent(row.value.targetValue) : row.value.targetValue}`}</td><td style={cell}>{row.value.reportingDateRange ? `${row.value.reportingDateRange.reportingDateFrom.slice(0, 10)} → ${row.value.reportingDateRange.reportingDateTo.slice(0, 10)}` : 'Not returned'}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
