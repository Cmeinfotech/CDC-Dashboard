"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from 'react-dom';
import AmazonTracking from './AmazonTracking';
import AmazonAttributeChanges from './AmazonAttributeChanges';
import { getAmazonMonitorData, invalidateAmazonMonitorCache } from '../services/dashboardService';

type Change = { id: string; detectedAt: string; sku: string; asin: string; title: string; kind: string; field: string; previous: unknown; current: unknown; priority: string; availability: string; status: string };
type Product = { sku: string; asin: string; title: string; image?: string | null; parentage: string; parentAsins: string[]; childCount: number; detailsAvailable: boolean };
type State = { run: { capturedAt: string; sourceCapturedAt: string | null; source: string; marketplaceId: string; baseline: boolean; productCount: number; unavailableDetails: string[]; products: Product[] } | null;
  progress: { running: boolean; status: string; stage: string; completedAsins: number; totalAsins: number; error?: string } | null;
  changes: Change[]; history: { id: string; capturedAt: string; source: string; productCount: number; changeCount: number; baseline: boolean }[];
  automation: { schedule: string; enabled: boolean } | null; capabilities: { reviews: string; attribution: string };
};
const value = (data: unknown) => data == null ? "Not returned" : typeof data === "string" ? data : JSON.stringify(data, null, 2);
export default function AmazonMonitor({ scope = 'all', selectedProductParents = [] }: { scope?: 'all' | 'tracking' | 'attributes'; selectedProductParents?: string[] }) {
  const [data, setData] = useState<State | null>(null); const [error, setError] = useState("");
  const [view, setView] = useState("changes"); const [status, setStatus] = useState("Unreviewed"); const [query, setQuery] = useState(""); const [selected, setSelected] = useState<Change | null>(null); const [limit, setLimit] = useState(100);
  const dialog = useRef<HTMLDialogElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportTarget, setExportTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setExportTarget(document.getElementById('amazon-export-action')); }, []);
  const exportAll = async () => {
    setExporting(true); setError('');
    try {
      const response = await fetch('/api/amazon/export', { cache: 'no-store' });
      if (!response.ok) { const body = await response.json(); throw Error(body.error || 'Export failed.'); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a');
      link.href = url; link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'CDC-Amazon-All-Data.xlsx';
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); } finally { setExporting(false); }
  };
  useEffect(() => { if (selected && dialog.current && !dialog.current.open) dialog.current.showModal(); }, [selected]);
  const load = useCallback(async () => { try { const body = await getAmazonMonitorData(); setData(body); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Monitoring unavailable."); } }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 15000); return () => window.clearInterval(timer); }, [load]);
  const review = async (change: Change) => { try { const response = await fetch('/api/amazon/monitor', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: change.id, status: change.status === 'Reviewed' ? 'Unreviewed' : 'Reviewed' }) }); const body = await response.json(); if (!response.ok) throw Error(body.error); invalidateAmazonMonitorCache(); dialog.current?.close(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Review failed."); } };
  const q = query.toLowerCase();
  const selectedProducts = data?.run?.products.filter(product => !selectedProductParents.length || product.parentAsins.some(parent => selectedProductParents.includes(parent)) || selectedProductParents.includes(product.asin)) || [];
  const selectedChanges = data?.changes.filter(change => !selectedProductParents.length || selectedProducts.some(product => product.sku === change.sku || product.asin === change.asin || product.parentAsins.includes(change.asin))) || [];
  const scopedChanges = selectedChanges.filter(change => scope === 'all' || (scope === 'tracking' ? ['asin', 'family', 'added', 'missing', 'coverage'].includes(change.kind) : ['attribute', 'images', 'listing'].includes(change.kind)));
  const changes = scopedChanges.filter(change => (status === 'All' || change.status === status) && `${change.sku} ${change.asin} ${change.title} ${change.field} ${change.kind}`.toLowerCase().includes(q));
  const products = selectedProducts.filter(product => `${product.sku} ${product.asin} ${product.title} ${product.parentAsins.join(' ')}`.toLowerCase().includes(q));
  const filteredData = data ? { ...data, changes: selectedChanges, run: data.run ? { ...data.run, products: selectedProducts } : null } : data;
  const panel = { padding: 20, border: '1px solid #dde5ef', borderRadius: 12, background: 'white', marginBottom: 20 };
  const cell = { padding: 12, borderBottom: '1px solid #e4e9f1', verticalAlign: 'top' as const };
  const table = { width: '100%', textAlign: 'left' as const, borderCollapse: 'collapse' as const };
  const exportButton = <button className="dashboard-export-button" onClick={() => void exportAll()} disabled={exporting || !data}>{exporting ? 'Preparing Excel…' : 'Export all data'}</button>;
  return <div className={`amazon-monitor ${scope === 'tracking' ? 'tracking-workspace' : ''}`}>
    {exportTarget ? createPortal(exportButton, exportTarget) : <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>{exportButton}</div>}
    {scope === 'tracking' && data?.progress && <div className={`tracking-sync-status ${data.progress.running ? 'is-running' : data.progress.status === 'complete' ? 'is-complete' : 'is-warning'}`} role="status"><span className="tracking-sync-dot"/><strong>{data.progress.running ? 'Sync in progress' : data.progress.status === 'complete' ? 'Amazon data synced' : data.progress.status === 'running' ? 'Sync interrupted' : 'Sync needs attention'}</strong><span>{data.progress.totalAsins ? `${data.progress.completedAsins.toLocaleString()} / ${data.progress.totalAsins.toLocaleString()} ASINs` : data.progress.stage}</span><small>{data.progress.error || (data.progress.running ? 'Showing the last completed pull while new data loads.' : 'Tracking reflects the latest completed pull.')}</small></div>}
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {!data ? <p>Loading monitoring history…</p> : <>
      {scope === 'tracking' ? <AmazonTracking data={filteredData!} reload={load} /> : scope === 'attributes' ? <AmazonAttributeChanges data={filteredData!} reload={load} /> : <><section className="amazon-monitor-overview" style={panel}>
        <div className="amazon-monitor-overview-head"><div><span className="amazon-monitor-eyebrow">AMAZON DATA · CHANGE MONITOR</span><h2>Product change monitoring</h2><p>Review listing and ASIN changes detected between completed Amazon pulls.</p></div><span className={`amazon-monitor-live ${data.run ? 'is-ready' : ''}`}><i />{data.run ? 'Monitoring active' : 'Waiting for first pull'}</span></div>
        <div className="amazon-monitor-metrics">
          <div><span>Listings monitored</span><strong>{data.run?.productCount.toLocaleString() || '—'}</strong><small>{data.run ? `Marketplace ${data.run.marketplaceId}` : 'No completed baseline'}</small></div>
          <div><span>Awaiting review</span><strong>{scopedChanges.filter(change => change.status === 'Unreviewed').length.toLocaleString()}</strong><small>Changes in this view</small></div>
          <div><span>High / critical priority</span><strong>{scopedChanges.filter(change => change.status === 'Unreviewed' && ['High', 'Critical'].includes(change.priority)).length.toLocaleString()}</strong><small>Needs attention</small></div>
          <div><span>Automatic sync</span><strong className="amazon-monitor-sync-value">{data.automation?.enabled ? `Every ${data.automation.intervalMinutes || 30} min` : 'Not configured'}</strong><small>{data.automation?.enabled ? data.automation.schedule : 'Check sync setup'}</small></div>
        </div>
        <div className="amazon-monitor-run-info">
          <span><b>Last completed pull</b>{data.run ? new Date(data.run.capturedAt).toLocaleString() : 'No completed pull yet'}</span>
          {data.run && <span><b>Source</b>{data.run.source}{data.run.sourceCapturedAt ? ` · Captured ${new Date(data.run.sourceCapturedAt).toLocaleString()}` : ''}</span>}
          {data.progress && <span role="status"><b>{data.progress.running ? 'Sync in progress' : `Latest sync · ${data.progress.status}`}</b>{data.progress.stage}{data.progress.totalAsins ? ` · ${data.progress.completedAsins.toLocaleString()} / ${data.progress.totalAsins.toLocaleString()} ASINs` : ''}{data.progress.error ? ` · ${data.progress.error}` : ''}</span>}
        </div>
        {!!data.run?.unavailableDetails.length && <p className="amazon-monitor-note">{data.run.unavailableDetails.length} ASINs had details unavailable in the pull. Missing API details are not treated as confirmed listing deletions.</p>}
        {data.history.length === 1 && <p className="amazon-monitor-note">First baseline established. Changes can be detected after the next complete Amazon pull.</p>}
      </section>
      <section className="amazon-monitor-queue" style={panel}><div className="amazon-monitor-controls"><div className="amazon-monitor-tabs">{['changes', 'products', 'history'].map(tab => <button key={tab} className="btn" aria-pressed={view === tab} onClick={() => { setView(tab); setLimit(100); }}>{tab === 'changes' ? 'Change review queue' : tab === 'products' ? 'Monitored products' : 'Sync history'}</button>)}</div><input aria-label="Search monitored data" placeholder="Search SKU, ASIN or field…" value={query} onChange={e => { setQuery(e.target.value); setLimit(100); }} /></div>
        {view === 'changes' && <><label>Review status <select value={status} onChange={e => setStatus(e.target.value)}><option>Unreviewed</option><option>Reviewed</option><option>All</option></select></label><p>{changes.length} matching changes</p>{!changes.length ? <p>No matching detected changes. A completed comparison is required before claiming products are unchanged.</p> : <div style={{ overflowX: 'auto' }}><table style={table}><thead><tr>{['Detected', 'SKU / ASIN', 'Change', 'Field', 'Priority', 'Review'].map(title => <th key={title} style={cell}>{title}</th>)}</tr></thead><tbody>{changes.slice(0, limit).map(change => <tr key={change.id}><td style={cell}>{new Date(change.detectedAt).toLocaleString()}</td><td style={cell}>{change.sku}<br />{change.asin}</td><td style={cell}>{change.kind}</td><td style={cell}>{change.field}</td><td style={{ ...cell, color: change.priority === 'High' ? '#b42318' : undefined }}>{change.priority}</td><td style={cell}><button className="btn" onClick={() => setSelected(change)}>Compare values</button><br />{change.status}</td></tr>)}</tbody></table></div>}</>}
        {view === 'products' && <><p>{products.length.toLocaleString()} matching products</p><div style={{ overflowX: 'auto' }}><table style={table}><thead><tr>{['SKU', 'ASIN', 'Product', 'Parentage', 'Parent ASIN', 'Details'].map(title => <th key={title} style={cell}>{title}</th>)}</tr></thead><tbody>{products.slice(0, limit).map(product => <tr key={product.sku}><td style={cell}>{product.sku}</td><td style={cell}>{product.asin}</td><td style={cell}>{product.title}</td><td style={cell}>{product.parentage}</td><td style={cell}>{product.parentAsins.join(', ') || 'Not returned'}</td><td style={cell}><a href={`/amazon/product?asin=${encodeURIComponent(product.asin)}`}>View product</a>{!product.detailsAvailable && <p>API details unavailable</p>}</td></tr>)}</tbody></table></div></>}
        {view === 'history' && <div style={{ overflowX: 'auto' }}><table style={table}><thead><tr>{['Completed', 'Source', 'Listings', 'Changes', 'Run type'].map(title => <th key={title} style={cell}>{title}</th>)}</tr></thead><tbody>{data.history.map(run => <tr key={run.id}><td style={cell}>{new Date(run.capturedAt).toLocaleString()}</td><td style={cell}>{run.source}</td><td style={cell}>{run.productCount}</td><td style={cell}>{run.changeCount}</td><td style={cell}>{run.baseline ? 'Baseline' : 'Comparison'}</td></tr>)}</tbody></table></div>}
        {(view === 'changes' ? changes.length : view === 'products' ? products.length : 0) > limit && <button className="btn" onClick={() => setLimit(number => number + 100)}>Show 100 more</button>}
      </section>
      <section className="amazon-monitor-footnote" style={panel}><p>{data.capabilities.reviews}</p><p>{data.capabilities.attribution}</p><p>Marking a record reviewed is an acknowledgement only; it does not change Amazon listings or merge ASINs.</p></section>
      </>}
    </>}
    <dialog ref={dialog} aria-label="Compare product change" onClose={() => setSelected(null)} style={{ width: 'min(1000px, 95vw)', maxHeight: '85vh', overflowY: 'auto', padding: 24, borderRadius: 12, border: '1px solid #dde5ef' }}>{selected && <><button className="btn" autoFocus onClick={() => dialog.current?.close()}>Close</button><h2>{selected.field}</h2><p>{selected.title} · SKU {selected.sku}</p><p>{selected.availability}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>{(['previous', 'current'] as const).map(key => <div key={key} style={{ flex: '1 1 300px', minWidth: 0 }}><h3>{key === 'previous' ? 'Previous value' : 'Current value'}</h3><pre style={{ padding: 16, background: '#edf2fa', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value(selected[key])}</pre></div>)}</div><button className="btn" onClick={() => void review(selected)}>{selected.status === 'Reviewed' ? 'Reopen for review' : 'Mark reviewed'}</button></>}</dialog>
  </div>;
}



