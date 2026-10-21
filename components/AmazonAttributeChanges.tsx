"use client";

import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, CircleAlert, Search, SlidersHorizontal, X } from 'lucide-react';

type Change = { id: string; detectedAt: string; sku: string; asin: string; title: string; kind: string; field: string; previous: unknown; current: unknown; priority: string; availability: string; status: string };
type Data = { run: { capturedAt: string; sourceCapturedAt?: string | null; marketplaceId: string; productCount: number } | null; changes: Change[]; history: { capturedAt: string; baseline: boolean }[] };
type Group = { key: string; asin: string; sku: string; title: string; detectedAt: string; changes: Change[]; reviewed: number };

const friendly = (field: string) => field.replace(/^(attributes|listing)\./, '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
const category = (change: Change) => change.kind === 'images' ? 'Images' : change.kind === 'listing' ? 'Listing' : 'Product attribute';
const attributeName = (change: Change) => ({
  'attributes.item_name': 'Product title', 'attributes.title': 'Product title', 'listing.title': 'Listing title',
  'attributes.size': 'Size', 'attributes.color': 'Color', 'attributes.metal_type': 'Metal type', 'attributes.material': 'Material',
  'attributes.style': 'Style', 'attributes.bullet_point': 'Bullet points', 'attributes.product_description': 'Description',
  'attributes.customer_package_type': 'Packaging / pack type', 'attributes.number_of_items': 'Number of items',
  'attributes.total_diamond_weight': 'Diamond weight', 'attributes.earring_design': 'Earring design',
  'attributes.headphones_ear_placement': 'Ear placement', 'images': 'Product images',
  'listing.price': 'Price', 'listing.quantity': 'Quantity', 'listing.status': 'Listing status', 'listing.fulfillment': 'Fulfilment method',
}[change.field] || friendly(change.field));
const toText = (value: unknown): string => {
  if (value == null || value === '') return 'Not returned';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(item => {
    if (item && typeof item === 'object' && 'value' in item) return String((item as { value: unknown }).value ?? '');
    return toText(item);
  }).filter(Boolean).join(' · ') || 'Not returned';
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => `${friendly(key)}: ${toText(item)}`).join(' · ');
};
const short = (value: unknown, length = 110) => { const text = toText(value); return text.length > length ? `${text.slice(0, length - 1)}…` : text; };
const date = (value: string) => new Date(value).toLocaleString();
const changeSummary = (change: Change) => {
  if (change.previous == null || toText(change.previous) === 'Not returned') return 'New value returned by Amazon';
  if (change.current == null || toText(change.current) === 'Not returned') return 'Value no longer returned by Amazon';
  return 'Value changed by Amazon';
};
const businessMeaning = (change: Change) => {
  const label = attributeName(change);
  if (label === 'Packaging / pack type') return 'Packaging information changed. This is not a title, size, colour or metal change.';
  if (label === 'Product title' || label === 'Listing title') return 'The product title text changed.';
  if (label === 'Size') return 'The product size information changed.';
  if (label === 'Color') return 'The product colour information changed.';
  if (label === 'Metal type' || label === 'Material') return 'The product material information changed.';
  if (label === 'Product images') return 'Amazon returned a different product image set.';
  if (label === 'Price' || label === 'Quantity') return `The listing ${label.toLowerCase()} changed.`;
  return `${label} changed in the Amazon product data.`;
};

export default function AmazonAttributeChanges({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('All'); const [status, setStatus] = useState('Unreviewed'); const [sort, setSort] = useState('latest');
  const [page, setPage] = useState(1); const [selected, setSelected] = useState<Group | null>(null); const [saving, setSaving] = useState(false); const [bulkSaving, setBulkSaving] = useState(false); const pageSize = 10;
  const changes = data.changes.filter(change => ['attribute', 'images', 'listing'].includes(change.kind));
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const change of changes) {
      const key = `${change.sku}\u0000${change.asin}`;
      const current = map.get(key) || { key, asin: change.asin, sku: change.sku, title: change.title, detectedAt: change.detectedAt, changes: [], reviewed: 0 };
      current.changes.push(change); current.detectedAt = current.detectedAt > change.detectedAt ? current.detectedAt : change.detectedAt;
      current.reviewed += change.status === 'Reviewed' ? 1 : 0; map.set(key, current);
    }
    const latestGroups = [...map.values()].map(group => {
      const latestByField = new Map<string, Change>();
      for (const change of group.changes) {
        const key = `${change.kind}\u0000${change.field}`; const saved = latestByField.get(key);
        if (!saved || saved.detectedAt < change.detectedAt) latestByField.set(key, change);
      }
      const currentChanges = [...latestByField.values()].sort((a, b) => a.field.localeCompare(b.field));
      return { ...group, changes: currentChanges, reviewed: currentChanges.filter(change => change.status === 'Reviewed').length };
    });
    const term = query.trim().toLowerCase();
    return latestGroups.filter(group => {
      const text = `${group.asin} ${group.sku} ${group.title} ${group.changes.map(change => `${change.field} ${toText(change.previous)} ${toText(change.current)}`).join(' ')}`.toLowerCase();
      return (!term || text.includes(term)) && (kind === 'All' || group.changes.some(change => category(change) === kind)) && (status === 'All' || (status === 'Reviewed' ? group.reviewed === group.changes.length : group.reviewed < group.changes.length));
    }).sort((a, b) => sort === 'product' ? `${a.title} ${a.sku}`.localeCompare(`${b.title} ${b.sku}`) : sort === 'most' ? b.changes.length - a.changes.length || b.detectedAt.localeCompare(a.detectedAt) : b.detectedAt.localeCompare(a.detectedAt));
  }, [changes, kind, query, sort, status]);
  const pages = Math.max(1, Math.ceil(groups.length / pageSize)); const currentPage = Math.min(page, pages); const visible = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const clear = () => { setQuery(''); setKind('All'); setStatus('Unreviewed'); setSort('latest'); setPage(1); };
  const review = async () => {
    if (!selected || saving) return; setSaving(true);
    try { await Promise.all(selected.changes.filter(change => change.status !== 'Reviewed').map(async change => { const response = await fetch('/api/amazon/monitor', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: change.id, status: 'Reviewed' }) }); if (!response.ok) throw Error('Could not save review status.'); })); setSelected(null); await reload(); }
    finally { setSaving(false); }
  };
  const reviewAll = async () => {
    const ids = [...new Set(groups.flatMap(group => group.changes.filter(change => change.status !== 'Reviewed').map(change => change.id)))];
    if (!ids.length || bulkSaving) return; setBulkSaving(true);
    try { const response = await fetch('/api/amazon/monitor', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids, status: 'Reviewed' }) }); if (!response.ok) throw Error('Could not mark all changes as reviewed.'); setStatus('Reviewed'); setPage(1); await reload(); }
    finally { setBulkSaving(false); }
  };
  const hasFilters = Boolean(query) || kind !== 'All' || status !== 'Unreviewed' || sort !== 'latest';
  return <section className="attribute-workspace">
    <header className="attribute-hero"><div><span>Amazon comparison</span><h2>Product attribute changes</h2><p>Each row compares the previous completed Amazon pull with the latest completed pull for the same seller SKU and ASIN.</p></div><div className="attribute-hero-meta"><b>{groups.length.toLocaleString()}</b><span>products needing review</span></div></header>
    <div className="attribute-source"><CircleAlert size={16}/><div><b>What changed?</b><span>{data.run ? `Latest Amazon pull: ${date(data.run.capturedAt)} · ${data.run.productCount.toLocaleString()} listings compared.` : 'No completed Amazon pull is available yet.'}</span></div><small>Changes are detected from Amazon API data. They are not edits made by this dashboard.</small></div>
    <section className="attribute-list-panel"><div className="attribute-list-head"><div><h3>Review changed products</h3><p>Open a product to see every changed field, including the old and new values.</p></div><div className="attribute-list-actions"><span>{changes.length.toLocaleString()} field changes</span>{status !== 'Reviewed' && <button className="attribute-mark-all" disabled={bulkSaving || !groups.length} onClick={() => void reviewAll()}>{bulkSaving ? 'Marking all…' : 'Mark all as reviewed'}</button>}</div></div>
      <div className="attribute-controls"><label className="attribute-search"><Search size={16}/><input aria-label="Search attribute changes" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search ASIN, SKU, product or value…" /></label><label><span>Type</span><select value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}><option>All</option><option>Product attribute</option><option>Listing</option><option>Images</option></select></label><div className="attribute-review-tabs" role="tablist" aria-label="Review status"><button role="tab" aria-selected={status === 'Unreviewed'} className={status === 'Unreviewed' ? 'active' : ''} onClick={() => { setStatus('Unreviewed'); setPage(1); }}>To review</button><button role="tab" aria-selected={status === 'Reviewed'} className={status === 'Reviewed' ? 'active' : ''} onClick={() => { setStatus('Reviewed'); setPage(1); }}>Reviewed</button><button role="tab" aria-selected={status === 'All'} className={status === 'All' ? 'active' : ''} onClick={() => { setStatus('All'); setPage(1); }}>All</button></div><label><span>Sort</span><select value={sort} onChange={event => { setSort(event.target.value); setPage(1); }}><option value="latest">Latest detected</option><option value="most">Most changes</option><option value="product">Product name</option></select></label>{hasFilters && <button className="attribute-clear" onClick={clear}><X size={15}/> Clear</button>}</div>
      <div className="attribute-table"><div className="attribute-table-head"><span>Product / ASIN</span><span>Changed attributes</span><span>Detected</span><span>Review</span></div>{visible.map(group => { const reviewed = group.reviewed === group.changes.length; return <article className={`attribute-row ${reviewed ? 'is-reviewed' : ''}`} key={group.key}><div className="attribute-product"><b>{group.title || 'Amazon product title not returned'}</b><small>SKU: {group.sku}</small><code>{group.asin}</code></div><div className="attribute-fields">{group.changes.slice(0, 4).map(change => <span key={change.id}>{attributeName(change)}</span>)}{group.changes.length > 4 && <span>+{group.changes.length - 4} more</span>}</div><time>{date(group.detectedAt)}</time><div><em className={reviewed ? 'is-reviewed' : ''}>{reviewed ? 'Reviewed' : `${group.changes.length - group.reviewed} to review`}</em><button disabled={reviewed} onClick={() => setSelected(group)}>{reviewed ? 'Review completed' : <>View details <ChevronRight size={15}/></>}</button></div></article>; })}</div>
      {!visible.length && <div className="attribute-empty"><SlidersHorizontal size={20}/><b>No matching attribute changes</b><span>Change the filters or clear them to view Amazon comparison results.</span></div>}
      {groups.length > pageSize && <nav className="attribute-pages"><span>Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, groups.length)} of {groups.length} products</span><div><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={15}/> Previous</button><b>{currentPage}</b><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next <ChevronRight size={15}/></button></div></nav>}
    </section>
    {selected && <div className="attribute-overlay" role="dialog" aria-modal="true" aria-labelledby="attribute-detail-title"><section><button className="attribute-close" aria-label="Close details" onClick={() => setSelected(null)}><X size={20}/></button><span className="attribute-detail-eyebrow">Amazon pull comparison</span><h2 id="attribute-detail-title">{selected.title || selected.asin}</h2><p className="attribute-detail-id">SKU: {selected.sku} · ASIN: <code>{selected.asin}</code></p><div className="attribute-detail-note"><Check size={16}/><span><b>{selected.changes.length === 1 ? `Only changed area: ${attributeName(selected.changes[0])}.` : `Changed areas: ${selected.changes.map(attributeName).join(', ')}.`}</b> Same seller SKU and ASIN were compared across two completed Amazon pulls. Older duplicate detections are hidden here.</span></div><div className="attribute-detail-table"><div className="attribute-detail-head"><span>What changed</span><span>Before: previous pull</span><span>Now: latest pull</span></div>{selected.changes.map(change => <div className="attribute-detail-change" key={change.id}><div><b>{attributeName(change)}</b><small>{businessMeaning(change)}</small></div><p title={toText(change.previous)}><i>Before</i>{short(change.previous, 260)}</p><p className="attribute-now" title={toText(change.current)}><i>Now</i>{short(change.current, 260)}</p></div>)}</div><footer><span>Latest detected: {date(selected.detectedAt)}</span><div><button onClick={() => setSelected(null)}>Close</button>{selected.reviewed < selected.changes.length && <button className="attribute-review" disabled={saving} onClick={() => void review()}>{saving ? 'Saving…' : 'Mark reviewed'}</button>}</div></footer></section></div>}
  </section>;
}
