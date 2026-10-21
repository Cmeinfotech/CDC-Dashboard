"use client";
import { useEffect, useState } from 'react';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { trackingValue } from '../../../services/amazonTrackingChanges.mjs';

type Audit = { action: string; actor: string; at: string; previousParentAsins: string[]; currentParentAsins: string[] };
type Change = { id: string; sku: string; asin: string; title: string; status: string; audit?: Audit[] };
type Product = { sku: string; asin: string; parentAsins: string[] };
type Data = { changes: Change[]; run: { products: Product[] } | null };

export default function ReversedMergesPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch('/api/amazon/monitor', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Reversal history could not be loaded.');
      setData(body);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  }, [retry]);
  const latestReversal = (c: Change) => c.audit?.filter(e=>e.action === 'Reversed').at(-1);
  const records = (data?.changes || []).filter(c=>c.status === 'Reversed' || latestReversal(c));
  const rows = records.filter(c=>(filter === 'all' || (filter === 'reversed' ? c.status === 'Reversed' : c.status !== 'Reversed')) && JSON.stringify(c).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>(latestReversal(b)?.at || '').localeCompare(latestReversal(a)?.at || ''));
  const pages = Math.max(1,Math.ceil(rows.length/10));
  const currentPage = Math.min(page,pages);
  return <main className="asin-history-page">
    <header className="asin-history-top"><a href="/?page=tracking"><ArrowLeft size={16}/> Back to ASIN tracking</a><span>CDC · Amazon product intelligence</span></header>
    <div className="asin-history-heading"><div><span className="asin-history-eyebrow">PRODUCT / ASIN TRACKING</span><h1>Reversed merge history</h1><p>All records with a reversal, including those merged again later.</p></div><Undo2 size={32}/></div>
    {error ? <section className="asin-history-card" role="alert"><p>{error}</p><button onClick={()=>setRetry(x=>x+1)}>Try again</button></section> : !data ? <section className="asin-history-card" role="status">Loading reversed merges…</section> : <>
      <div className="asin-history-stats"><section className="asin-history-card"><small>Records with reversal history</small><strong>{records.length}</strong></section><section className="asin-history-card"><small>Currently reversed</small><strong>{records.filter(c=>c.status === 'Reversed').length}</strong></section><section className="asin-history-card"><small>Recorded reversal actions</small><strong>{records.reduce((n,c)=>n+(c.audit?.filter(e=>e.action === 'Reversed').length || 0),0)}</strong></section></div>
      <section className="asin-history-card"><div className="asin-history-timeline-head"><div><h2>Reversed ASIN / parent merges</h2><p>{rows.length} matching records · newest reversal first</p></div><div className="reversed-history-filters"><input aria-label="Search reversed merges" placeholder="Search SKU, ASIN, product or admin…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/><select aria-label="Reversal status" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">All reversal history</option><option value="reversed">Currently reversed</option><option value="later">Updated after reversal</option></select></div></div>
        {rows.slice((currentPage-1)*10,currentPage*10).map(c=>{
          const event = latestReversal(c);
          const product = data.run?.products.find(p=>p.sku === c.sku && p.asin === c.asin);
          return <article className="reversed-history-record" key={c.id}><div className="asin-history-event-head"><h3>{c.title || c.sku}</h3><span className="asin-history-status">{c.status}</span></div><p>SKU: <b>{c.sku}</b> · Child ASIN: <code>{c.asin}</code></p><div className="asin-history-comparison"><div><small>PARENT BEFORE REVERSAL (B)</small><code>{event ? trackingValue(event.previousParentAsins) : 'Not recorded'}</code></div><Undo2 size={18}/><div><small>RESTORED PARENT (A)</small><code>{event ? trackingValue(event.currentParentAsins) : 'Not recorded'}</code></div></div><p>Reversed on: {event ? new Date(event.at).toLocaleString() : 'Not recorded'} · Admin: {event?.actor || 'Not recorded'}</p><p>Dashboard parent now: <code>{product ? trackingValue(product.parentAsins) : 'Listing not in latest pull'}</code></p>
            <details className="reversed-history-audit"><summary>Complete merge / reversal history ({c.audit?.length || 0})</summary>{c.audit?.map((entry,i)=><div className="tracking-review-list" key={i}><b>{entry.action} · {new Date(entry.at).toLocaleString()}</b><p>By: {entry.actor}<br /><code>{trackingValue(entry.previousParentAsins)}</code> → <code>{trackingValue(entry.currentParentAsins)}</code></p></div>)}</details><a className="tracking-history-link" href={`/amazon/history?asin=${encodeURIComponent(c.asin)}`}>View full ASIN history →</a>
          </article>;
        })}
        {!rows.length && <p>No reversed merges match these filters.</p>}
        <nav className="asin-history-pagination" aria-label="Reversed merges pagination"><span>Page {currentPage} of {pages}</span><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</button><button disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Next</button></nav>
      </section><p className="asin-history-note">Reversals affect the selected SKU in this dashboard only. Newer Amazon pulls remain authoritative. Original merges and reversals remain in the saved audit history.</p>
    </>}
  </main>;
}
