"use client";
import { useEffect, useRef, useState } from 'react';
import ProductThumbnail from './ProductThumbnail';
import { useGlobalDateRange } from './GlobalDateRange';
import { isTrackingChange, isPreservedChange, preservedChangeDate, reversalDate, trackingDateInRange, trackingChangeLabel, trackingValue, trackingQueueValues } from '../services/amazonTrackingChanges.mjs';
import { Boxes, Search, TriangleAlert, History, ChevronDown, ArrowRight, Undo2, RefreshCw } from 'lucide-react';

type Product = { image?: string | null; sku: string; asin: string; title: string; parentage: string; parentAsins: string[]; childCount: number; detailsAvailable: boolean };
type Change = { id: string; detectedAt: string; sku: string; asin: string; title: string; kind: string; field: string; previous: unknown; current: unknown; status: string; linkedAt?: string | null; activeMapping?: { currentParentAsins: string[]; previousParentAsins: string[]; direction?: string; mergedAt?: string; reason?: string }; audit?: { action: string; actor: string; at: string; reason?: string; previousParentAsins: string[]; currentParentAsins: string[] }[] };
type Data = { permissions?: { isMainAdmin: boolean; canReverse: boolean; adminConfigured: boolean }; run: { products: Product[]; capturedAt: string; baseline: boolean } | null; changes: Change[]; history: { id?: string; capturedAt?: string; source?: string; productCount?: number; changeCount?: number; baseline: boolean }[] };
function SkuMatchEvidence({ change }: { change: Change }) {
  if (!isTrackingChange(change)) return null;
  return <section className="sku-match-evidence"><h3>Match basis: seller SKU</h3><p>The same seller SKU was matched between the previous and current complete Amazon pulls.</p><div className="tracking-history-scroll"><table className="tracking-history-table"><thead><tr><th>Compared field</th><th>Previous pull</th><th>Current pull</th><th>Result</th></tr></thead><tbody><tr><td>Seller SKU</td><td><code>{change.sku}</code></td><td><code>{change.sku}</code></td><td><b className="sku-match-result">✓ SKU matched</b></td></tr><tr><td>Listing ASIN</td><td><code>{change.kind === 'asin' ? trackingValue(change.previous) : change.asin}</code></td><td><code>{change.kind === 'asin' ? trackingValue(change.current) : change.asin}</code></td><td>{change.kind === 'asin' ? 'ASIN changed' : 'Same ASIN'}</td></tr>{change.kind === 'family' && <tr><td>{change.field === 'parentAsins' ? 'Parent ASIN' : 'Child membership'}</td><td><code>{change.field === 'childAsins' ? `${Array.isArray(change.previous) ? change.previous.length : 0} children` : trackingValue(change.previous)}</code></td><td><code>{change.field === 'childAsins' ? `${Array.isArray(change.current) ? change.current.length : 0} children` : trackingValue(change.current)}</code></td><td>Relationship changed</td></tr>}</tbody></table></div><p>{change.kind === 'asin' ? 'Same SKU → different listing ASIN: recorded as an ASIN replacement.' : 'Same SKU and listing ASIN → different parent/child relationship: recorded as a family change.'} SKU matching does not establish that all product attributes are identical.</p></section>;
}

function AsinReview({ change, changes }: { change: Change; changes: Change[] }) {
  const before: string[] = Array.isArray(change.previous) ? change.previous : [];
  const after: string[] = Array.isArray(change.current) ? change.current : [];
  const removed = before.filter(asin => !after.includes(asin));
  const added = after.filter(asin => !before.includes(asin));
  const childChange = change.kind === 'family' && change.field === 'childAsins';
  const affected = [...new Set([...removed, ...added])];
  const [childQuery, setChildQuery] = useState('');
  const affectedRows = affected.filter(asin => {
    const child = changes.find(c=>c.asin === asin);
    return `${asin} ${child?.sku || ''} ${child?.title || ''}`.toLowerCase().includes(childQuery.trim().toLowerCase());
  });
  const [childLimit, setChildLimit] = useState(10);
  return <>
    {childChange ? <><p>Parent ASIN: <code>{change.asin}</code> · Children: {before.length} → {after.length}</p><p><b>{added.length} added · {removed.length} removed</b> · Unchanged children are hidden.</p>
      <input aria-label="Search affected child ASIN, SKU or title" placeholder="Search child ASIN, SKU or title…" value={childQuery} onChange={e=>{setChildQuery(e.target.value);setChildLimit(10);}} />
      <div className="tracking-history-scroll"><table className="tracking-history-table"><thead><tr><th>Child ASIN</th><th>Previous parent</th><th>Current parent</th><th>History</th></tr></thead><tbody>{affectedRows.slice(0,childLimit).map(asin=>{
        const move = changes.find(c=>c.kind === 'family' && c.field === 'parentAsins' && c.asin === asin && c.detectedAt === change.detectedAt);
        return <tr key={asin}><td><code>{asin}</code><small>{added.includes(asin) ? 'Added to this parent' : 'Removed from this parent'}</small></td><td><code>{move ? trackingValue(move.previous) : removed.includes(asin) ? change.asin : 'Not recorded'}</code></td><td><code>{move ? trackingValue(move.current) : added.includes(asin) ? change.asin : 'Not recorded'}</code></td><td><a className="tracking-history-link" href={`/amazon/history?asin=${encodeURIComponent(asin)}`}>View history →</a></td></tr>;
      })}</tbody></table></div>{!affectedRows.length && <p>No matching child ASINs.</p>}{affectedRows.length>childLimit && <button onClick={()=>setChildLimit(x=>x+10)}>Show 10 more children</button>}
      <p>“Not recorded” means the other parent was not available in this saved comparison.</p>
      <details className="tracking-review-snapshots"><summary>View full previous / current child lists</summary><div className="tracking-review-full"><b>Previous children ({before.length})</b><p><code>{trackingValue(before)}</code></p><b>Current children ({after.length})</b><p><code>{trackingValue(after)}</code></p></div></details>
    </> : <><p><b>{change.field === 'parentAsins' ? 'Previous parent ASIN' : 'Previous ASIN'}:</b> <code>{trackingValue(change.previous)}</code></p><p><b>{change.field === 'parentAsins' ? 'Current parent ASIN' : 'Current ASIN'}:</b> <code>{trackingValue(change.current)}</code></p></>}
    <a className="tracking-history-link" href={`/amazon/history?asin=${encodeURIComponent(change.asin)}`}>View history for {change.asin} →</a>
  </>;
}

export default function AmazonTracking({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const { startDate: start, endDate: end } = useGlobalDateRange();
  const globalRangeActive = Boolean(start && end && start <= end);
  const [view, setView] = useState('changes');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<Change | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Change | null>(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [reverseError, setReverseError] = useState('');
  const reverseDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (reverseTarget && !reverseDialog.current?.open) reverseDialog.current?.showModal(); else if (!reverseTarget) reverseDialog.current?.close(); }, [reverseTarget]);
  const [pendingLinks, setPendingLinks] = useState<Change[]>([]);
  const [mergeReason, setMergeReason] = useState('');
  const confirmation = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (pendingLinks.length && !confirmation.current?.open) confirmation.current?.showModal();
    else if (!pendingLinks.length) confirmation.current?.close();
  }, [pendingLinks]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [limit, setLimit] = useState(20);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => { setPage(1); setLimit(20); }, [start, end]);
  const products = data.run?.products || [];
  const byAsin = new Map(products.map(p => [p.asin, p]));
  const groups = new Map<string, { asin: string; parent?: Product; children: Product[] }>();
  for (const p of products) {
    const keys = p.parentAsins.length ? p.parentAsins : [p.asin];
    for (const asin of keys) {
      if (!groups.has(asin)) groups.set(asin, { asin, parent: byAsin.get(asin), children: [] });
      if (p.parentAsins.length) groups.get(asin)!.children.push(p);
    }
  }
  const families = [...groups.values()].filter(g => g.children.length || g.parent?.parentage === 'Parent').sort((a,b) => a.asin.localeCompare(b.asin));
  const familyIds = new Set(families.map(g => g.asin));
  const standalone = products.filter(p => !p.parentAsins.length && p.parentage !== 'Parent' && !familyIds.has(p.asin));
  const childCount = products.filter(p => p.parentAsins.length).length;
  const matches = (x: unknown) => JSON.stringify(x).toLowerCase().includes(query.trim().toLowerCase());
  const rowDate = (c: Change): string => view === 'reversed' ? reversalDate(c) : view === 'history' ? preservedChangeDate(c) : c.detectedAt;
  const inRange = (c: Change) => !globalRangeActive || trackingDateInRange(rowDate(c), start, end);
  const structuralChanges = data.changes.filter(isTrackingChange);
  const currentSkus = new Set(products.map(p => p.sku));
  const missing = [...new Map(data.changes.filter(c => c.kind === 'missing' && !currentSkus.has(c.sku)).sort((a,b) => a.detectedAt.localeCompare(b.detectedAt)).map(c => [c.sku, c])).values()];
  const linked = structuralChanges.filter(isPreservedChange);
  const reversed = structuralChanges.filter(c=>c.status === 'Reversed' || c.audit?.some(e=>e.action === 'Reversed'));
  const syncRuns = data.history.filter(run => matches(run) && (!globalRangeActive || trackingDateInRange(run.capturedAt || '', start, end))).sort((a,b) => (b.capturedAt || '').localeCompare(a.capturedAt || ''));
  const rows = (view === 'sync' ? [] : view === 'reversed' ? reversed : view === 'missing' ? missing : view === 'history' ? linked : structuralChanges).filter(c => matches(c) && inRange(c)).sort((a,b) => rowDate(b).localeCompare(rowDate(a)));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(offset, offset + pageSize);
  const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1).filter(n => n === 1 || n === pageCount || Math.abs(n - currentPage) <= 1);
  const visibleGroups = families.filter(g => matches(g));
  const visibleStandalone = standalone.filter(matches);
  const confirmLink = (changes: Change[]) => {
    setError('');
    setMergeReason('');
    setPendingLinks(changes.filter(c => isTrackingChange(c) && c.status !== 'Merged' && (!c.linkedAt || c.field === 'parentAsins')));
  };
  const link = async (changes: Change[]) => {
    const reason = mergeReason.trim();
    if (!reason) { setError('Enter a reason before confirming this history change.'); return; }
    setBusy(true); setError('');
    try { for (const c of changes) { const response = await fetch('/api/amazon/monitor', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: c.id, status: c.kind === 'family' && c.field === 'parentAsins' ? 'Merged' : 'Linked', reason }) }); const result = await response.json(); if (!response.ok) throw Error(result.error || 'Could not merge change history. Refresh and retry.'); } setPendingLinks([]); setMergeReason(''); setSelected(null); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Link failed'); await reload(); } finally { setBusy(false); }
  };
  const reverse = async () => {
    if (!reverseTarget || busy) return;
    setBusy(true); setReverseError('');
    try {
      const response = await fetch('/api/amazon/monitor/reverse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: reverseTarget.id, password: adminPassword, confirm: true }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Reversal failed.');
      setReverseTarget(null); setSelected(null); await reload();
    } catch(e) { setReverseError(e instanceof Error ? e.message : 'Reversal failed.'); }
    finally { setAdminPassword(''); setBusy(false); }
  };
  const exportRows = () => {
    const records = view === 'sync' ? [['Completed','Source','Listings','Changes','Run type'], ...syncRuns.map(run => [run.capturedAt || '',run.source || '',run.productCount ?? '',run.changeCount ?? '',run.baseline ? 'Baseline' : 'Comparison'])] : view === 'parents' ? [['Parent ASIN','SKU','ASIN','Product','Parentage'], ...products.filter(matches).map(p => [p.parentAsins.join(';'),p.sku,p.asin,p.title,p.parentage])] : [['SKU','ASIN','Product','Change','Previous value','Current value',view === 'history' ? 'Last merge / reversal' : 'Detected','Status','Reason'], ...rows.map(c => [c.sku,c.asin,c.title,trackingChangeLabel(c),trackingValue(c.previous),trackingValue(c.current),rowDate(c),c.status,c.audit?.filter(event => event.action === 'Merged' || event.action === 'Linked').at(-1)?.reason || ''])];
    const csv = records.map(row => row.map(v => `"${String(v).replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"','""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'})); const a = document.createElement('a'); a.href=url; a.download=`CDC-ASIN-${view}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  return <div className="amazon-tracking">
    {globalRangeActive && <p className="tracking-footnote">The dashboard date range filters detected changes, history actions, reversals, and Amazon pull history. Tracked parents and Product catalog show the latest saved catalog snapshot.</p>}
    <div className="tracking-stats">{[
      {id:'parents',label:'Tracked parents',count:families.length,note:`${childCount.toLocaleString()} child listings · ${standalone.length.toLocaleString()} standalone listings · Latest catalog (not date-filtered)`,icon:Boxes},
      {id:'reversed',label:'Reversed merges',count:reversed.filter(c=>!globalRangeActive || trackingDateInRange(reversalDate(c),start,end)).length,note:'Records with reversal history · view all',icon:Undo2},
      {id:'changes',label:'Changes detected',count:structuralChanges.filter(c=>!globalRangeActive || trackingDateInRange(c.detectedAt,start,end)).length,note:'ASIN replacements & parent/child changes',icon:TriangleAlert},
      {id:'history',label:'Preserved histories',count:linked.filter(c=>!globalRangeActive || trackingDateInRange(preservedChangeDate(c),start,end)).length,note:'Merged and reversed ASIN / family history',icon:History},
      {id:'sync',label:'Amazon pull history',count:syncRuns.length,note:'Completed pull and comparison runs',icon:RefreshCw}
    ].map(card => <button key={card.id} aria-pressed={view === card.id} className={view === card.id ? 'active' : ''} onClick={()=>{if(card.id === 'parents'){window.dispatchEvent(new CustomEvent('dashboard-open-page',{detail:'productCatalog'}));return;}setView(card.id);if(card.id === 'history' || card.id === 'reversed'){setQuery('');}setLimit(20);setPage(1);}}><card.icon size={24}/><span><small>{card.label}</small><strong>{card.count.toLocaleString()}</strong><small>{card.note}</small></span><span>›</span></button>)}</div>
    {!data.history.some(r=>!r.baseline) && <p className="tracking-notice">First baseline only. ASIN replacements and missing listings can be detected after the next complete Amazon pull.</p>}
    {error && <p role="alert">{error}</p>}
    <section className="tracking-panel"><div className="tracking-section-head"><div><h2>{view === 'sync' ? 'Amazon pull history' : view === 'parents' ? 'Parent / child catalog' : view === 'missing' ? 'Missing ASINs' : view === 'reversed' ? 'Reversed merge history' : view === 'history' ? 'Preserved ASIN history' : 'Detected ASIN changes'}</h2><p>{view === 'sync' ? `${syncRuns.length} saved Amazon pull runs · includes baselines and completed comparisons` : view === 'parents' ? 'Current Amazon catalog grouped by returned parent relationships. Date filters apply to detected changes.' : `${rows.length} matching records · ${view === 'reversed' ? 'reversal date shown' : view === 'history' ? 'latest merge / reversal date shown' : 'detection date shown'}`}</p></div><div className="tracking-actions"><input aria-label="Search tracking" placeholder={view === 'sync' ? 'Search pull history…' : 'Search SKU, ASIN or product…'} value={query} onChange={e=>{setQuery(e.target.value);setLimit(20);setPage(1);}}/><button className="dashboard-export-button" onClick={exportRows}>Export view</button>{view === 'changes' && <button className="tracking-primary" disabled={busy || !rows.some(c=>isTrackingChange(c) && c.status !== 'Merged' && (!c.linkedAt || c.field === 'parentAsins'))} onClick={()=>confirmLink(rows)} title="Merge all eligible histories across every page of the current filtered results">{busy ? 'Merging…' : 'Merge all histories'}</button>}</div></div>
    {view === 'sync' ? <div className="tracking-history-scroll"><table className="tracking-history-table"><thead><tr><th>Completed</th><th>Source</th><th>Listings</th><th>Changes</th><th>Run type</th></tr></thead><tbody>{syncRuns.slice(0,limit).map((run,index)=><tr key={run.id || `${run.capturedAt}-${index}`}><td>{run.capturedAt ? new Date(run.capturedAt).toLocaleString() : 'Not recorded'}</td><td>{run.source || 'Amazon pull'}</td><td>{run.productCount?.toLocaleString() ?? 'Not returned'}</td><td>{run.changeCount?.toLocaleString() ?? 'Not returned'}</td><td><span className="tracking-status">{run.baseline ? 'Baseline' : 'Comparison'}</span></td></tr>)}</tbody></table>{!syncRuns.length && <p className="tracking-empty">No completed Amazon pulls are available yet.</p>}</div> : (view === 'history' || view === 'reversed') ? <><div className="tracking-history-scroll"><table className="tracking-history-table preserved-history-table"><thead><tr><th>Product / SKU</th><th>{view === 'reversed' ? 'Reversed: B → A' : 'Previous → current'}</th><th>Merged on</th><th>Latest action</th><th>Dashboard parent now</th><th>Details</th></tr></thead><tbody>{pageRows.map(c=>{
      const merged = c.audit?.find(event=>event.action === 'Merged');
      const historyEvent = c.audit?.filter(event=>event.action === 'Merged' || event.action === 'Linked').at(-1);
      const mergedAt = merged?.at || c.linkedAt || c.activeMapping?.mergedAt;
      const latest = view === 'reversed' ? c.audit?.filter(e=>e.action === 'Reversed').at(-1) : c.audit?.at(-1);
      const displayValues = view === 'reversed' && latest ? [trackingValue(latest.previousParentAsins), trackingValue(latest.currentParentAsins)] : trackingQueueValues(c);
      const current = products.find(p=>p.sku === c.sku && p.asin === c.asin);
      return <tr key={c.id}><td><b>{c.title || c.sku}</b><small>SKU: {c.sku} · ASIN: {c.asin}</small><small>{trackingChangeLabel(c)}</small></td><td><small>{c.field === 'parentAsins' ? 'Parent ASIN' : c.field === 'childAsins' ? 'Removed → added children' : 'Listing ASIN'}</small><code>{displayValues[0]}</code><br />→ <code>{displayValues[1]}</code></td><td>{mergedAt ? new Date(mergedAt).toLocaleString() : 'Not recorded'}{merged?.actor && <small>By {merged.actor}</small>}</td><td><span className="tracking-status">{c.status === 'Reversed' ? 'Reversed' : c.status === 'Merged' ? 'Merged' : c.linkedAt ? 'History linked' : c.status}</span><small>{new Date(rowDate(c)).toLocaleString()}</small>{latest?.actor && <small>By {latest.actor}</small>}{historyEvent?.reason && <small>Reason: {historyEvent.reason}</small>}</td><td><code>{current ? current.parentAsins.join(', ') || 'No parent returned' : 'Listing not in latest pull'}</code></td><td><button onClick={()=>setSelected(c)}>{view === 'reversed' ? 'View details' : 'Review / reverse'}</button>{view !== 'reversed' && <a className="tracking-history-link" href={`/amazon/history?asin=${encodeURIComponent(c.asin)}`}>View history →</a>}</td></tr>;
    })}</tbody></table></div>{!rows.length && <p className="tracking-empty">{view === 'reversed' ? 'No matching reversed merges. Clear filters to see all reversal history.' : 'No matching merged or reversed records. Merge an ASIN / parent change first, or clear your filters.'}</p>}</> : view === 'parents' ? <><p>{visibleGroups.length} parent groups · {visibleStandalone.length} standalone listings</p>{visibleGroups.slice(0,limit).map(g=><div className="tracking-family" key={g.asin}><button aria-expanded={expanded.includes(g.asin)} onClick={()=>setExpanded(x=>x.includes(g.asin)?x.filter(id=>id!==g.asin):[...x,g.asin])}><ChevronDown size={16}/><span><b>{g.parent?.title || 'Parent details not returned'}</b><small>Parent ASIN: {g.asin} {g.parent ? `· SKU: ${g.parent.sku}` : ''}</small></span><span>{g.children.length} child listings</span></button>{expanded.includes(g.asin) && <div className="tracking-children">{g.children.map(p=><div key={p.sku}><span>{p.title}<small>SKU: {p.sku}</small></span><a href={`/amazon/product?asin=${encodeURIComponent(p.asin)}`}>{p.asin}</a><small>{p.detailsAvailable ? 'Details available' : 'API details unavailable'}</small></div>)}</div>}</div>)}{visibleStandalone.slice(0,limit).map(p=><div className="tracking-change" key={p.sku}><span>{p.title}<small>Standalone / relationship not returned · SKU: {p.sku}</small></span><a href={`/amazon/product?asin=${encodeURIComponent(p.asin)}`}>{p.asin}</a></div>)}{!visibleGroups.length && !visibleStandalone.length && <p>No matching products in the latest pull.</p>}</> : <>{pageRows.map(c=><div className="tracking-change" key={c.id}><ProductThumbnail src={products.find(p=>p.sku === c.sku && p.asin === c.asin)?.image} title={c.title || c.asin}/><span><b>{c.title || c.sku}</b><small>SKU: {c.sku} · ASIN: {c.asin}<br />{trackingChangeLabel(c)} · {new Date(c.detectedAt).toLocaleString()}</small></span><div className="tracking-asin"><small>{c.kind === 'family' ? c.field === 'childAsins' ? 'Removed child ASINs' : 'Previous parent ASIN' : 'Previous ASIN'}</small><code>{trackingQueueValues(c)[0]}</code></div><ArrowRight size={16}/><div className="tracking-asin"><small>{view === 'missing' ? 'Latest pull' : c.kind === 'family' ? c.field === 'childAsins' ? 'Added child ASINs' : 'Current parent ASIN' : 'Current ASIN'}</small><code>{trackingQueueValues(c)[1]}</code></div><span className="tracking-status">{c.status === 'Merged' ? 'Current parent active' : c.linkedAt ? 'History linked' : c.status}</span><button className="tracking-primary" onClick={()=>setSelected(c)}>Review change</button></div>)}{!rows.length && <p className="tracking-empty">{view === 'changes' ? 'No ASIN replacements or parent/child changes recorded for these filters. Changes are compared between complete Amazon pulls.' : view === 'missing' ? 'No matching missing listings.' : 'No histories merged yet. Review an ASIN or parent/child change to preserve its history.'}</p>}</>}
    {view === 'sync' ? syncRuns.length>limit && <button onClick={()=>setLimit(x=>x+20)}>Show 20 more</button> : view === 'parents' ? Math.max(visibleGroups.length,visibleStandalone.length)>limit && <button onClick={()=>setLimit(x=>x+20)}>Show 20 more</button> : <nav className="tracking-pagination" aria-label="ASIN changes pagination">
      <span aria-live="polite">Showing {rows.length ? offset + 1 : 0}–{Math.min(offset + pageSize, rows.length)} of {rows.length} records</span>
      <label>Rows per page <select aria-label="Tracking rows per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{[10,20,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></label>
      <div className="tracking-page-controls"><button disabled={currentPage === 1} onClick={()=>setPage(currentPage-1)}>Previous</button>{pageNumbers.map((n,i)=><span key={n}>{i>0 && n-pageNumbers[i-1]>1 && <span className="tracking-page-gap">…</span>}<button aria-label={`Page ${n}`} aria-current={n === currentPage ? 'page' : undefined} onClick={()=>setPage(n)}>{n}</button></span>)}<button disabled={currentPage === pageCount} onClick={()=>setPage(currentPage+1)}>Next</button></div>
    </nav>}</section>
    <dialog ref={confirmation} className="tracking-confirmation" aria-labelledby="tracking-confirm-title" aria-describedby="tracking-confirm-description" onCancel={e=>{if(busy)e.preventDefault();else {setPendingLinks([]);setMergeReason('');}}}>
      <h2 id="tracking-confirm-title">{pendingLinks.length > 1 ? 'Confirm merge all matching histories' : 'Confirm history merge'}</h2>
      <p id="tracking-confirm-description">This will process {pendingLinks.length.toLocaleString()} eligible ASIN / relationship {pendingLinks.length === 1 ? 'change' : 'changes'} across all pages in the current filtered results. Parent changes make the current parent active for that SKU in this dashboard and preserve the previous parent in history; other changes save a history link. Amazon listings and sales totals stay unchanged. Enter why you are confirming this change; the reason, user, and time will be recorded in history.</p>
      <div className="tracking-confirm-items">{pendingLinks.map(c=><div key={c.id}><b>{c.title || c.sku}</b><small>SKU: {c.sku} · ASIN: {c.asin} · {trackingChangeLabel(c)}</small><p>{c.field === 'childAsins' ? 'Removed children' : 'Previous'}: <code>{trackingQueueValues(c)[0]}</code><br />{c.field === 'childAsins' ? 'Added children' : 'Current'}: <code>{trackingQueueValues(c)[1]}</code></p></div>)}</div>
      <label className="tracking-reason-label">Reason for this history change<textarea required maxLength={1000} rows={3} value={mergeReason} onChange={e=>setMergeReason(e.target.value)} placeholder="Explain why this ASIN or parent relationship is being confirmed…" disabled={busy} /></label>
      {error && <p role="alert">{error}</p>}
      <div className="tracking-confirm-actions"><button autoFocus disabled={busy} onClick={()=>{setPendingLinks([]);setMergeReason('');}}>Cancel</button><button className="tracking-primary" disabled={busy || !pendingLinks.length || !mergeReason.trim()} onClick={()=>void link(pendingLinks)}>{busy ? 'Merging…' : pendingLinks.length > 1 ? 'OK, merge all' : 'Confirm & merge history'}</button></div>
    </dialog>
    <dialog ref={reverseDialog} className="tracking-confirmation" aria-labelledby="reverse-merge-title" onCancel={e=>{if(busy)e.preventDefault();else {setReverseTarget(null);setAdminPassword('');}}}>
      <form onSubmit={e=>{e.preventDefault();void reverse();}}><h2 id="reverse-merge-title">Reverse merge — administrator approval</h2><p>Restore the previous parent for this SKU only. The original merge stays in audit history. Amazon listings and sales totals stay unchanged.</p>
      {reverseTarget && <div className="tracking-review-list"><b>SKU: {reverseTarget.sku} · ASIN: {reverseTarget.asin}</b><p>Active parent B: <code>{trackingValue(reverseTarget.activeMapping?.currentParentAsins || reverseTarget.current)}</code><br />Restore parent A: <code>{trackingValue(reverseTarget.activeMapping?.previousParentAsins || reverseTarget.previous)}</code></p></div>}
      <label className="reverse-password-label">Main administrator password<input autoFocus type="password" autoComplete="current-password" required maxLength={1024} value={adminPassword} onChange={e=>setAdminPassword(e.target.value)} disabled={busy} /></label>
      {reverseError && <p role="alert">{reverseError}</p>}<div className="tracking-confirm-actions"><button type="button" disabled={busy} onClick={()=>{setReverseTarget(null);setAdminPassword('');}}>Cancel</button><button type="submit" className="tracking-primary" disabled={busy || !adminPassword}>{busy ? 'Verifying…' : 'Verify & reverse merge'}</button></div></form>
    </dialog>
    <p className="tracking-footnote">Parent merges activate the current parent for the selected SKU and preserve the previous parent in history. They do not update Amazon listings or combine sales totals. Missing listings are not confirmed product deletions.</p>
    {selected && <div className="tracking-overlay"><section role="dialog" aria-modal="true" aria-label="Review ASIN change" className="tracking-panel"><button onClick={()=>setSelected(null)}>Close</button><h2>{selected.title || selected.sku}</h2><p>SKU: {selected.sku} · ASIN: {selected.asin}</p><h3>{trackingChangeLabel(selected)}</h3><SkuMatchEvidence change={selected} /><AsinReview key={selected.id} change={selected} changes={data.changes} />{selected.activeMapping && <p className="tracking-active-parent"><b>Dashboard active parent:</b> <code>{trackingValue(selected.activeMapping.currentParentAsins)}</code>{selected.status === 'Reversed' ? ' · Previous parent restored' : ' · Current parent accepted'}</p>}{!!selected.audit?.length && <details className="tracking-review-snapshots"><summary>Merge / reversal audit history ({selected.audit.length})</summary>{selected.audit.map((event,i)=><div className="tracking-review-list" key={i}><b>{event.action} · {new Date(event.at).toLocaleString()}</b><p>By: {event.actor}{event.reason && <><br />Reason: {event.reason}</>}<br /><code>{trackingValue(event.previousParentAsins)}</code> → <code>{trackingValue(event.currentParentAsins)}</code></p></div>)}</details>}<p>Detected: {new Date(selected.detectedAt).toLocaleString()}</p><p>{selected.kind === 'asin' ? 'Same seller SKU returned a different ASIN between complete Amazon pulls.' : selected.kind === 'family' ? 'Amazon returned different parent/child relationships between complete pulls. The listing ASIN may stay the same.' : 'This SKU is absent from the latest complete listing pull. Verify its listing status.'}</p>{selected.status === 'Merged' && <div className="tracking-reverse-action">{data.permissions?.isMainAdmin ? <><button disabled={busy || !data.permissions.canReverse} onClick={()=>{setAdminPassword('');setReverseError('');setReverseTarget(selected);}}>Reverse merge</button>{!data.permissions.canReverse && <p>Main administrator password setup is required before reversing.</p>}</> : <p>Only the main administrator can reverse this merge.</p>}</div>}{isTrackingChange(selected) && <button className="tracking-primary" disabled={busy || selected.status === 'Merged' || (!!selected.linkedAt && selected.field !== 'parentAsins')} onClick={()=>confirmLink([selected])}>{selected.status === 'Merged' ? 'Current parent active' : selected.linkedAt ? 'History linked' : busy ? 'Merging…' : selected.kind === 'family' && selected.field === 'parentAsins' ? 'Merge → use current parent' : 'Link history'}</button>}</section></div>}
  </div>;
}


