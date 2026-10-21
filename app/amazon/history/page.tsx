"use client";
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, History, Boxes } from 'lucide-react';
import { trackingChangeLabel, trackingValue } from '../../../services/amazonTrackingChanges.mjs';

type Change = { id: string; asin: string; sku: string; title: string; kind: string; field: string; previous: unknown; current: unknown; detectedAt: string; status: string; audit?: { action: string; actor: string; at: string; previousParentAsins: string[]; currentParentAsins: string[] }[] };
type Product = { asin: string; title: string; sku: string; parentAsins: string[]; parentage: string };
type Data = { run: { capturedAt: string; products: Product[] } | null; changes: Change[]; history: { capturedAt: string }[] };
const list = (value: unknown): string[] => Array.isArray(value) ? value : [];
export default function AsinHistoryPage() {
  const [asin, setAsin] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const value = (new URLSearchParams(window.location.search).get('asin') || '').trim().toUpperCase();
    setAsin(value);
    if (!/^[A-Z0-9]{10}$/.test(value)) { setError('Open history with a valid 10-character ASIN.'); return; }
    const controller = new AbortController();
    setError('');
    fetch('/api/amazon/monitor', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'History could not be loaded.');
      setData(body);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [attempt]);
  const events = (data?.changes || []).filter(c => {
    if (!['asin', 'family', 'missing', 'added'].includes(c.kind)) return false;
    if (c.asin === asin || c.kind === 'asin' && (c.previous === asin || c.current === asin)) return true;
    return c.kind === 'family' && c.field === 'childAsins' && list(c.previous).includes(asin) !== list(c.current).includes(asin);
  }).sort((a,b) => b.detectedAt.localeCompare(a.detectedAt));
  const products = data?.run?.products.filter(p => p.asin === asin) || [];
  const product = products[0];
  const title = product?.title || events.find(c=>c.asin === asin)?.title || 'ASIN history';
  const filtered = events.filter(c => filter === 'all' || c.kind === filter);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages);
  const earliest = data?.history.map(h=>h.capturedAt).sort()[0];
  const values = (c: Change): [string, string] => {
    if(c.kind === 'family' && c.field === 'childAsins') {
      if(c.asin !== asin) return [list(c.previous).includes(asin) ? c.asin : 'Not recorded', list(c.current).includes(asin) ? c.asin : 'Not recorded'];
      return [`${list(c.previous).length} connected children`, `${list(c.current).length} connected children`];
    }
    return [trackingValue(c.previous), trackingValue(c.current)];
  };
  return <main className="asin-history-page">
    <header className="asin-history-top"><a href="/?page=tracking"><ArrowLeft size={16}/> Back to ASIN tracking</a><span>CDC · Amazon product intelligence</span></header>
    <div className="asin-history-heading"><div><span className="asin-history-eyebrow">PRODUCT / ASIN TRACKING</span><h1>ASIN change history</h1><p>Follow listing and parent/child changes across saved Amazon pulls.</p></div><History size={32}/></div>
    {error ? <section className="asin-history-card" role="alert"><h2>History unavailable</h2><p>{error}</p><button onClick={()=>setAttempt(x=>x+1)}>Try again</button></section> : !data ? <section className="asin-history-card" role="status">Loading ASIN history…</section> : <>
      <section className="asin-history-card asin-history-product"><div className="asin-history-icon"><Boxes size={30}/></div><div><h2>{title}</h2><p>ASIN <code>{asin}</code> · SKU: {products.map(p=>p.sku).join(', ') || events.find(c=>c.asin === asin)?.sku || 'Not returned'}</p><p>Latest parent: <code>{product ? product.parentAsins.join(', ') || 'No parent returned' : 'Listing not in latest pull'}</code></p></div><a href={`/amazon/product?asin=${encodeURIComponent(asin)}`}>Product details →</a></section>
      <div className="asin-history-stats"><section className="asin-history-card"><small>Saved change events</small><strong>{events.length}</strong></section><section className="asin-history-card"><small>Latest detected change</small><strong>{events[0] ? new Date(events[0].detectedAt).toLocaleDateString() : 'No changes'}</strong></section><section className="asin-history-card"><small>Latest completed Amazon pull</small><strong>{data.run ? new Date(data.run.capturedAt).toLocaleString() : 'Unavailable'}</strong></section></div>
      <section className="asin-history-card"><div className="asin-history-timeline-head"><div><h2>Change timeline</h2><p>Newest first · {filtered.length} events</p></div><label>Change type <select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">All changes</option><option value="family">Parent / child</option><option value="asin">ASIN replacements</option><option value="missing">Missing listings</option><option value="added">Added listings</option></select></label></div>
        <div className="asin-history-timeline">{filtered.slice((currentPage-1)*10,currentPage*10).map(c=><article key={c.id}><div className="asin-history-dot"/><div className="asin-history-event-head"><h3>{c.kind === 'added' ? 'Listing added' : trackingChangeLabel(c)}</h3><time dateTime={c.detectedAt}>{new Date(c.detectedAt).toLocaleString()}</time></div><p>SKU: {c.sku} · {c.kind === 'family' && c.field === 'childAsins' && c.asin !== asin ? 'Related parent' : 'Listing ASIN'}: <code>{c.asin}</code></p><div className="asin-history-comparison"><div><small>PREVIOUS {c.kind === 'family' ? c.field === 'parentAsins' || c.asin !== asin ? 'PARENT ASIN' : 'CHILDREN' : 'ASIN'}</small><code>{values(c)[0]}</code></div><ArrowRight size={18}/><div><small>CURRENT {c.kind === 'family' ? c.field === 'parentAsins' || c.asin !== asin ? 'PARENT ASIN' : 'CHILDREN' : 'ASIN'}</small><code>{values(c)[1]}</code></div></div>{c.field === 'childAsins' && c.asin === asin && <details><summary>View added / removed children</summary><p>Added: <code>{trackingValue(list(c.current).filter(a=>!list(c.previous).includes(a)))}</code></p><p>Removed: <code>{trackingValue(list(c.previous).filter(a=>!list(c.current).includes(a)))}</code></p></details>}<span className="asin-history-status">{c.status}</span>{!!c.audit?.length && <details><summary>Merge / reversal audit ({c.audit.length})</summary>{c.audit.map((event,i)=><div key={i}><p><b>{event.action}</b> · {new Date(event.at).toLocaleString()} · By {event.actor}</p><p><code>{trackingValue(event.previousParentAsins)}</code> → <code>{trackingValue(event.currentParentAsins)}</code></p></div>)}</details>}</article>)}</div>
        {!filtered.length && <p>No saved changes for this ASIN and filter.</p>}
        <nav className="asin-history-pagination" aria-label="History pagination"><span>Page {currentPage} of {pages}</span><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</button><button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Next</button></nav>
      </section><p className="asin-history-note">{earliest ? `Saved coverage starts ${new Date(earliest).toLocaleString()}. ` : ''}Detection dates show when changes were observed, not the exact Amazon edit time. Related parent events can describe the same move. “Not recorded” means the other parent was unavailable in that comparison.</p>
    </>}
  </main>;
}
