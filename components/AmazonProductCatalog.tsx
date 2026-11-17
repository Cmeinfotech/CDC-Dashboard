"use client";
import { Fragment, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import KpiCard from './KpiCard';
import ProductThumbnail from './ProductThumbnail';
import { useGlobalDateRange } from './GlobalDateRange';
import { getAmazonProductCatalog } from '../services/dashboardService';
import { ChevronRight } from 'lucide-react';
type Sale = { currency: string; amount: number; units: number | null; months: Record<string,number>; lastSaleDate?: string | null };
type Stock = { total: number; sellable: number; reserved: number; unsellable: number };
type Product = { image?: string | null; imageCount: number; lastSaleDate: string | null; sku: string; asin: string; title: string; parentage: string; parentAsins: string[]; childAsins: string[]; detailsAvailable: boolean; status: string | null; price: string | null; quantity: string | null; attributes: Record<string,string>; sales: Sale[]; fbaStock: Stock | null; fulfillment: string | null; recent30DayUnits: number };
type Catalog = { products: Product[]; capturedAt: string | null; inventoryPulledAt: string | null; stockRiskCoverDays?:number; salesSource: {available:boolean; start:string|null; end:string|null; coverageStart?:string; coverageEnd?:string; dormantSince:string; dormantCoverageAvailable:boolean} };
const money = (s: {currency:string;amount:number}) => new Intl.NumberFormat('en-US',{style:'currency',currency:s.currency}).format(s.amount);
const amounts = (sales: Sale[]) => sales.length ? sales.map(money).join(' / ') : 'Not available';
const STOCK_VELOCITY_DAYS = 30;
function combine(products: Product[]) {
  const currencies = new Map<string,Sale>();
  for (const p of products) for (const s of p.sales) {
    const total = currencies.get(s.currency) || {currency:s.currency,amount:0,units:s.units == null ? null : 0,months:{},lastSaleDate:null as string|null};
    total.amount += s.amount; total.units = total.units == null || s.units == null ? null : total.units + s.units;
    for (const [month,value] of Object.entries(s.months)) total.months[month]=(total.months[month]||0)+value;
    if(s.lastSaleDate&&(!total.lastSaleDate||s.lastSaleDate>total.lastSaleDate))total.lastSaleDate=s.lastSaleDate;
    currencies.set(s.currency,total);
  }
  return [...currencies.values()];
}
export default function AmazonProductCatalog({ capturedAt, revision, active = true }: {capturedAt?:string; revision?:string; active?:boolean}) {
  const { startDate, endDate, selectedProductParents } = useGlobalDateRange();
  const globalRangeActive = Boolean(startDate && endDate && startDate <= endDate);
  const [data,setData]=useState<Catalog|null>(null); const [error,setError]=useState(''); const [retry,setRetry]=useState(0);
  const [headingActions,setHeadingActions]=useState<HTMLElement|null>(null);
  const [listingFilter,setListingFilter]=useState<'active'|'inactive'|'incomplete'|null>(null);
  const toggleListingFilter=(status:'active'|'inactive'|'incomplete')=>{setListingFilter(value=>value===status?null:status);setStockRiskOnly(false);setDormantOnly(false);setPage(1);};
  const [query,setQuery]=useState(''); const [page,setPage]=useState(1); const [expanded,setExpanded]=useState<string[]>([]); const [stockRiskOnly,setStockRiskOnly]=useState(false); const [dormantOnly,setDormantOnly]=useState(false);
  useEffect(()=>{setHeadingActions(active?document.getElementById('product-catalog-actions'):null);},[active]);
  useEffect(()=>{setPage(1);},[startDate,endDate,selectedProductParents]);
  useEffect(()=>{let active=true;setError('');getAmazonProductCatalog().then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(e.message||'Could not load the saved Amazon catalog.');});return()=>{active=false;};},[capturedAt,revision,retry]);
  const products=data?.products||[]; const byAsin=new Map(products.map(p=>[p.asin,p]));
  const selectedProducts=products.filter(p=>!selectedProductParents.length||selectedProductParents.some(parent=>p.asin===parent||p.parentAsins.includes(parent)));
  const activeListingCount=selectedProducts.filter(p=>p.status?.trim().toLowerCase()==='active').length;
  const matchesListing=(p:Product)=>!listingFilter||p.status?.trim().toLowerCase()===listingFilter;
  const inactiveListingCount=selectedProducts.filter(p=>p.status?.trim().toLowerCase()==='inactive').length;
  const incompleteListingCount=selectedProducts.filter(p=>p.status?.trim().toLowerCase()==='incomplete').length;
  const dormantCoverageAvailable=Boolean(data?.salesSource.dormantCoverageAvailable);
  const stockRiskCoverDays=data?.stockRiskCoverDays||7;
  const isDormant=(p:Product)=>dormantCoverageAvailable&&(!p.lastSaleDate||p.lastSaleDate<=data!.salesSource.dormantSince);
  const dormantProducts=selectedProducts.filter(isDormant);
  const stockRisk=(p:Product)=>{
    if(p.fulfillment!=='AMAZON_NA'||!p.fbaStock)return false;
    const sellable=Number(p.fbaStock.sellable);
    const units=Number(p.recent30DayUnits||0);
    const daysOfCover=units>0?sellable/(units/STOCK_VELOCITY_DAYS):Infinity;
    return sellable<=0||(units>0&&daysOfCover<=stockRiskCoverDays);
  };
  const stockRiskProducts=selectedProducts.filter(stockRisk);
  const inventoryAvailable=Boolean(data?.inventoryPulledAt&&selectedProducts.some(p=>p.fulfillment==='AMAZON_NA'&&p.fbaStock));
  const stockRiskKeys=new Set(stockRiskProducts.map(p=>JSON.stringify([p.sku,p.asin])));
  const salesInRange=(sales:Sale[])=>{
    if(!globalRangeActive)return sales;
    return sales.flatMap(s=>{
      const months=Object.fromEntries(Object.entries(s.months).filter(([month])=>{
        if(!/^\d{4}-\d{2}$/.test(month))return false;
        const monthStart=`${month}-01`;const monthEndDate=new Date(`${monthStart}T00:00:00`);monthEndDate.setMonth(monthEndDate.getMonth()+1,0);const monthEnd=`${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth()+1).padStart(2,'0')}-${String(monthEndDate.getDate()).padStart(2,'0')}`;
        return monthStart<=endDate&&monthEnd>=startDate;
      }));
      if(!Object.keys(months).length)return [];
      return [{...s,amount:Object.values(months).reduce((sum,value)=>sum+value,0),units:null,months}];
    });
  };
  const groups=new Map<string,{asin:string;parent?:Product;children:Product[]}>();
  for(const p of products)for(const asin of p.parentAsins.length?p.parentAsins:[p.asin]){if(!groups.has(asin))groups.set(asin,{asin,parent:byAsin.get(asin),children:[]});if(p.parentAsins.length)groups.get(asin)!.children.push(p);}
  const q=query.trim().toLowerCase(); const matches=(p:unknown)=>(JSON.stringify(p) || '').toLowerCase().includes(q);
  const families=[...groups.values()].filter(g=>g.children.length||g.parent?.parentage==='Parent'); const familyIds=new Set(families.map(g=>g.asin));
  const entries=[...families.map(g=>({...g,standalone:false})),...products.filter(p=>!p.parentAsins.length&&!familyIds.has(p.asin)).map(p=>({asin:p.asin,parent:p,children:[] as Product[],standalone:true}))].filter(g=>{const groupProducts=[...(g.parent?[g.parent]:[]),...g.children];return (!selectedProductParents.length||selectedProductParents.includes(g.asin))&&matches(g)&&(!listingFilter||groupProducts.some(matchesListing))&&(!stockRiskOnly||groupProducts.some(p=>inventoryAvailable?stockRiskKeys.has(JSON.stringify([p.sku,p.asin])):p.fulfillment==='AMAZON_NA'))&&(!dormantOnly||groupProducts.some(isDormant));}).sort((a,b)=>(a.parent?.title||a.asin).localeCompare(b.parent?.title||b.asin));
  const hasCardFilter=Boolean(listingFilter||stockRiskOnly||dormantOnly);
  const catalogFocus=listingFilter?'listing-status':stockRiskOnly?'stock':dormantOnly?'sales-activity':null;
  const matchesCard=(p:Product)=>matchesListing(p)&&(!stockRiskOnly||(inventoryAvailable?stockRiskKeys.has(JSON.stringify([p.sku,p.asin])):p.fulfillment==='AMAZON_NA'))&&(!dormantOnly||isDormant(p));
  const isGroupExpanded=(g:typeof entries[number])=>expanded.includes(g.asin)||Boolean(q&&g.children.some(matches));
  const matchingChildren=(g:typeof entries[number])=>g.children.filter(matchesCard).filter(p=>!q||matches(g.parent?{...g.parent,childAsins:[]}:undefined)||matches(p)||g.asin.toLowerCase().includes(q));
  const rows=entries.flatMap(g=>[
    ...((!hasCardFilter||(g.parent&&matchesCard(g.parent)))?[{group:g,product:g.parent,child:false}]:[]),
    ...(hasCardFilter||isGroupExpanded(g)?matchingChildren(g).map(product=>({group:g,product,child:true})):[])
  ]);
  const pageSize=15;
  const maxPage=Math.max(1,Math.ceil(rows.length/pageSize));
  const currentPage=Math.min(page,maxPage);
  const visible=rows.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const exportCatalog=()=>{const records=[['Parent ASIN','ASIN','SKU','Title','Relationship','Attributes','Sales (selected date range)','Last sale date','Dormant (90 days)','Image count','FBA total','FBA sellable','FBA reserved','FBA unsellable','Status'],...entries.flatMap(g=>[...(g.parent?[g.parent]:[]),...g.children].filter(matchesCard).map(p=>[p.parentAsins.join(';'),p.asin,p.sku,p.title,p.parentage,JSON.stringify(p.attributes),amounts(salesInRange(p.sales)),p.lastSaleDate||'No saved sale',dormantCoverageAvailable?(isDormant(p)?'Yes':'No'):'History unavailable',p.imageCount,p.fbaStock?.total??'Not returned',p.fbaStock?.sellable??'Not returned',p.fbaStock?.reserved??'Not returned',p.fbaStock?.unsellable??'Not returned',p.status||'Not returned']))];const csv=records.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='CDC-Amazon-Product-Catalog.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const attrs=(p?:Product)=>p&&Object.keys(p.attributes).length?Object.entries(p.attributes).map(([k,v])=>`${k.replaceAll('_',' ')}: ${v}`).join(' · '):'Attributes not returned';
  const listingStatus=(p?:Product)=>p?.status?.trim()||'Not returned';
  const statusClass=(p?:Product)=>`catalog-listing-status${p?.status?` catalog-listing-status-${p.status.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`:''}`;
  const stockLabel=(p:Product)=>p.fulfillment==='AMAZON_NA'?p.fbaStock?`${p.fbaStock.total} total · ${p.fbaStock.sellable} sellable · ${p.fbaStock.reserved} reserved`:'Not in latest FBA inventory pull':p.fulfillment==='DEFAULT'?'FBM · no FBA stock':'Not returned';
  const listingActivity=(p:Product)=>!dormantCoverageAvailable?'90-day history unavailable':isDormant(p)?'Dormant · no sale in 90 days':p.lastSaleDate?`Selling · last sale ${p.lastSaleDate}`:'Sales history unavailable';
  const detailHref=(product:Product)=>`/amazon/product?asin=${encodeURIComponent(product.asin)}&sku=${encodeURIComponent(product.sku)}&from=catalog`;
  const toolbar=headingActions?createPortal(<div className="tracking-actions product-catalog-heading-actions"><input aria-label="Search product catalog" placeholder="Search product, ASIN, SKU or attribute…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/><button className="dashboard-export-button" disabled={!data} onClick={exportCatalog}>Export CSV</button></div>,headingActions):null;
  return <>{toolbar}<section className="tracking-panel live-product-catalog" aria-label="Product catalog">
    {error?<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></p>:!data?<p>Loading Amazon product catalog…</p>:<>
    <div className="catalog-insight-cards catalog-summary-cards" aria-label="Product catalogue summary">
      <KpiCard title="Active products" count={activeListingCount.toLocaleString()} className="catalog-kpi" selected={listingFilter==='active'} onClick={()=>toggleListingFilter('active')} />
      <KpiCard title="Inactive products" count={inactiveListingCount.toLocaleString()} className="catalog-kpi" selected={listingFilter==='inactive'} onClick={()=>toggleListingFilter('inactive')} />
      <KpiCard title="Incomplete products" count={incompleteListingCount.toLocaleString()} className="catalog-kpi" selected={listingFilter==='incomplete'} onClick={()=>toggleListingFilter('incomplete')} />
      <KpiCard title="FBA stock at risk" count={inventoryAvailable?stockRiskProducts.length.toLocaleString():'—'} className="catalog-kpi" selected={stockRiskOnly} onClick={()=>{setListingFilter(null);setStockRiskOnly(value=>!value);setDormantOnly(false);setPage(1);}} />
      <KpiCard title="Dormant listings (90 days)" count={dormantCoverageAvailable?dormantProducts.length.toLocaleString():'—'} className="catalog-kpi" selected={dormantOnly} disabled={!dormantCoverageAvailable} onClick={()=>{setListingFilter(null);setDormantOnly(value=>!value);setStockRiskOnly(false);setPage(1);}} />
    </div>
    <div className="live-catalog-scroll">
      <table className={`live-catalog-table${catalogFocus ? ` catalog-focus-${catalogFocus}` : ''}`}>
        <thead><tr><th>Product hierarchy</th><th>Relationship</th><th>{catalogFocus === 'listing-status' ? 'Product' : 'Product attributes'}</th>{catalogFocus === 'listing-status' && <th>SKU</th>}<th>Sales</th><th>Image count</th><th>Sales activity</th><th>FBA stock</th><th>Listing status</th><th>View details</th></tr></thead>
        <tbody>{visible.map(({ group, product, child }) => {
          const familySales = combine([...(group.parent ? [group.parent] : []), ...group.children].map(item => ({ ...item, sales: salesInRange(item.sales) })));
          const isExpanded = isGroupExpanded(group);
          return <Fragment key={JSON.stringify([group.asin, product?.sku, child])}>
            {child && product ? <tr className="catalog-child">
              <td><div className="catalog-child-identity"><ProductThumbnail src={product.image} title={product.title} /><span className="catalog-child-link">{product.asin}</span></div><small>Child of {group.asin}</small></td>
              <td><span className="catalog-badge child">Child ASIN</span></td>
              {catalogFocus === 'listing-status' ? <><td><b>{product.title}</b></td><td><code>{product.sku || '—'}</code></td></> : <td><b>{product.title}</b><small>SKU: {product.sku}</small><small>{attrs(product)}</small></td>}
              <td>{amounts(salesInRange(product.sales))}</td><td>{product.imageCount}<small>images</small></td><td><span className={isDormant(product) ? 'catalog-listing-activity-dormant' : 'catalog-listing-activity-current'}>{listingActivity(product)}</span></td><td>{stockLabel(product)}</td><td><span className={statusClass(product)}>{listingStatus(product)}</span></td><td><a className="catalog-detail-trigger" href={detailHref(product)}>View details</a></td>
            </tr> : <tr>
              <td><div className="catalog-identity">{!group.standalone && <button aria-label={`Expand parent ${group.asin}`} aria-expanded={isExpanded} onClick={() => setExpanded(current => current.includes(group.asin) ? current.filter(asin => asin !== group.asin) : [...current, group.asin])}><ChevronRight size={16} style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }} /></button>}<ProductThumbnail src={group.parent?.image} title={group.parent?.title || group.asin} /><span><b>{group.parent?.title || group.asin}</b><small>{group.asin}{catalogFocus === 'listing-status' ? '' : group.parent ? ` · SKU: ${group.parent.sku}` : ''}</small></span></div></td>
              <td><span className="catalog-badge">{group.standalone ? 'Standalone / unconfirmed' : 'Parent ASIN'}</span></td>
              {catalogFocus === 'listing-status' ? <><td><b>{group.parent?.title || group.asin}</b></td><td><code>{group.parent?.sku || '—'}</code></td></> : <td><span className="catalog-attribute-summary">{attrs(group.parent)}</span><small>{group.children.length} connected child listings</small></td>}
              <td>{amounts(familySales)}{!group.standalone && <small>Family total</small>}</td><td>{group.parent?.imageCount ?? '—'}{group.parent && <small>images</small>}</td><td><span className={group.parent && isDormant(group.parent) ? 'catalog-listing-activity-dormant' : group.parent ? 'catalog-listing-activity-current' : ''}>{group.parent ? listingActivity(group.parent) : 'Expand for child listings'}</span></td><td>{group.parent ? stockLabel(group.parent) : 'Not returned'}</td><td><span className={statusClass(group.parent)}>{listingStatus(group.parent)}</span></td><td><a className="catalog-detail-trigger" href={detailHref(group.parent || group.children[0])}>View details</a></td>
            </tr>}
          </Fragment>;
        })}</tbody>
      </table>
    </div>{!rows.length&&<p>No matching products returned in this catalog.</p>}<nav className="catalog-pagination" aria-label="Product pagination"><span>Showing {rows.length?(currentPage-1)*pageSize+1:0}–{Math.min(currentPage*pageSize,rows.length)} of {rows.length} products · 15 per page</span><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</button><label className="catalog-page-select">Page <select aria-label="Go to product page" value={currentPage} onChange={e=>setPage(Number(e.target.value))}>{Array.from({length:maxPage},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select> of {maxPage}</label><button disabled={currentPage===maxPage} onClick={()=>setPage(currentPage+1)}>Next</button></nav></>}
  </section></>;
}
