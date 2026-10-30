"use client";
import { Fragment, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const toggleListingFilter=(status:'active'|'inactive'|'incomplete')=>{setListingFilter(value=>value===status?null:status);setStockRiskOnly(false);setDormantOnly(false);setPerformerOnly(false);setPage(1);};
  const [query,setQuery]=useState(''); const [page,setPage]=useState(1); const [expanded,setExpanded]=useState<string[]>([]); const [stockRiskOnly,setStockRiskOnly]=useState(false); const [dormantOnly,setDormantOnly]=useState(false); const [performerOnly,setPerformerOnly]=useState(false);
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
  const outOfStockCount=stockRiskProducts.filter(p=>Number(p.fbaStock?.sellable)<=0).length;
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
  const topPerformer=[...selectedProducts].map(product=>({product,sales:salesInRange(product.sales)})).map(item=>({...item,total:item.sales.reduce((sum,sale)=>sum+sale.amount,0)})).sort((a,b)=>b.total-a.total).find(item=>item.total>0);
  const groups=new Map<string,{asin:string;parent?:Product;children:Product[]}>();
  for(const p of products)for(const asin of p.parentAsins.length?p.parentAsins:[p.asin]){if(!groups.has(asin))groups.set(asin,{asin,parent:byAsin.get(asin),children:[]});if(p.parentAsins.length)groups.get(asin)!.children.push(p);}
  const q=query.trim().toLowerCase(); const matches=(p:unknown)=>(JSON.stringify(p) || '').toLowerCase().includes(q);
  const families=[...groups.values()].filter(g=>g.children.length||g.parent?.parentage==='Parent'); const familyIds=new Set(families.map(g=>g.asin));
  const performerKeys=new Set(topPerformer?[topPerformer.product.asin,topPerformer.product.sku]:[]);
  const entries=[...families.map(g=>({...g,standalone:false})),...products.filter(p=>!p.parentAsins.length&&!familyIds.has(p.asin)).map(p=>({asin:p.asin,parent:p,children:[] as Product[],standalone:true}))].filter(g=>{const groupProducts=[...(g.parent?[g.parent]:[]),...g.children];return (!selectedProductParents.length||selectedProductParents.includes(g.asin))&&matches(g)&&(!listingFilter||groupProducts.some(matchesListing))&&(!stockRiskOnly||groupProducts.some(p=>inventoryAvailable?stockRiskKeys.has(JSON.stringify([p.sku,p.asin])):p.fulfillment==='AMAZON_NA'))&&(!dormantOnly||groupProducts.some(isDormant))&&(!performerOnly||groupProducts.some(p=>performerKeys.has(p.asin)||performerKeys.has(p.sku)));}).sort((a,b)=>(a.parent?.title||a.asin).localeCompare(b.parent?.title||b.asin));
  const hasCardFilter=Boolean(listingFilter||stockRiskOnly||dormantOnly||performerOnly);
  const matchesCard=(p:Product)=>matchesListing(p)&&(!stockRiskOnly||(inventoryAvailable?stockRiskKeys.has(JSON.stringify([p.sku,p.asin])):p.fulfillment==='AMAZON_NA'))&&(!dormantOnly||isDormant(p))&&(!performerOnly||performerKeys.has(p.asin)||performerKeys.has(p.sku));
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
      <button type="button" className={`catalog-status-kpi active`} aria-pressed={listingFilter==='active'} onClick={()=>toggleListingFilter('active')}>
        <span><small>Active products</small><em>Latest Amazon listing status</em></span>
        <strong>{activeListingCount.toLocaleString()}</strong>
        <em>{listingFilter==='active'?'Selected · click to clear':'Click to view active products'}</em>
      </button>
      <button type="button" className={`catalog-status-kpi inactive`} aria-pressed={listingFilter==='inactive'} onClick={()=>toggleListingFilter('inactive')}>
        <span><small>Inactive products</small><em>Latest Amazon listing status</em></span>
        <strong>{inactiveListingCount.toLocaleString()}</strong>
        <em>{listingFilter==='inactive'?'Selected · click to clear':'Click to view inactive products'}</em>
      </button>
      <button type="button" className="catalog-status-kpi incomplete" aria-pressed={listingFilter==='incomplete'} onClick={()=>toggleListingFilter('incomplete')}>
        <span><small>Incomplete products</small><em>Latest Amazon listing status</em></span>
        <strong>{incompleteListingCount.toLocaleString()}</strong>
        <em>{listingFilter==='incomplete'?'Selected · click to clear':'Click to view incomplete products'}</em>
      </button>
      <button type="button" className={`catalog-insight-card catalog-performer-card${performerOnly?' active':''}`} aria-pressed={performerOnly} onClick={()=>{setListingFilter(null);setPerformerOnly(value=>!value);setStockRiskOnly(false);setDormantOnly(false);setPage(1);}}>
        <small>Strong performer · saved order history</small>
        {topPerformer?<><b title={topPerformer.product.title}>{topPerformer.product.title}</b><strong>{amounts(topPerformer.sales)} recorded sales</strong><span>{topPerformer.product.asin} · {topPerformer.product.sku}</span></>:<b>No sales history available</b>}
      </button>
      <button type="button" className={`catalog-insight-card catalog-stock-risk-card${stockRiskOnly?' active':''}${!inventoryAvailable?' unavailable':''}`} aria-pressed={stockRiskOnly} onClick={()=>{setListingFilter(null);setStockRiskOnly(value=>!value);setDormantOnly(false);setPerformerOnly(false);setPage(1);}}>
        <small>FBA stock at risk</small>
        <strong>{inventoryAvailable?stockRiskProducts.length.toLocaleString():'—'}</strong>
        <span>{inventoryAvailable?`${outOfStockCount} out of stock · ${Math.max(0,stockRiskProducts.length-outOfStockCount)} at ${stockRiskCoverDays} days or less of cover`:'Inventory data unavailable · click to view FBA listings'}</span>
        <em>{stockRiskOnly?(inventoryAvailable?'Showing at-risk listings · click to clear':'Showing FBA listings · inventory data unavailable · click to clear'):'Based on sellable stock and the last 30 days of orders · click to filter'}</em>
      </button>
      <button type="button" className={`catalog-insight-card catalog-dormant-card${dormantOnly?' active':''}${!dormantCoverageAvailable?' unavailable':''}`} disabled={!dormantCoverageAvailable} aria-pressed={dormantOnly} onClick={()=>{setListingFilter(null);setDormantOnly(value=>!value);setStockRiskOnly(false);setPerformerOnly(false);setPage(1);}}>
        <small>Dormant listings · no sales in 90 days</small>
        <strong>{dormantCoverageAvailable?dormantProducts.length.toLocaleString():'—'}</strong>
        <span>{dormantCoverageAvailable?'Listings with no saved order in the last 90 days':'90-day order history is not available yet'}</span>
        <em>{dormantOnly?'Showing dormant listings · click to clear':'Based on the saved Amazon order history · click to filter'}</em>
      </button>
    </div>
    {(listingFilter||performerOnly||stockRiskOnly||dormantOnly)&&<div className="catalog-filter-summary" role="status"><span>Showing <strong>{listingFilter?listingFilter+' products':performerOnly?'Strong performer':stockRiskOnly?'FBA stock at risk':'Dormant listings'}</strong> · {rows.length.toLocaleString()} matching products</span><button type="button" onClick={()=>{setListingFilter(null);setPerformerOnly(false);setStockRiskOnly(false);setDormantOnly(false);setPage(1);}}>Clear filter ×</button></div>}
    <div className="live-catalog-scroll"><table className="live-catalog-table"><thead><tr><th>Product hierarchy</th><th>Relationship</th><th>Product attributes</th><th>Sales</th><th>Image count</th><th>Sales activity</th><th>FBA stock</th><th>Listing status</th></tr></thead><tbody>{visible.map(({group:g,product:p,child})=>{const familySales=combine([...(g.parent?[g.parent]:[]),...g.children].map(p=>({...p,sales:salesInRange(p.sales)})));const isExpanded=isGroupExpanded(g);return <Fragment key={JSON.stringify([g.asin,p?.sku,child])}>{child&&p?<tr className="catalog-child" key={p.sku}><td><div className="catalog-child-identity"><ProductThumbnail src={p.image} title={p.title}/><span className="catalog-child-link">{p.asin}</span></div><small>Child of {g.asin}</small></td><td><span className="catalog-badge child">Child ASIN</span></td><td><b>{p.title}</b><small>SKU: {p.sku}</small><small>{attrs(p)}</small><a className="catalog-detail-trigger" href={detailHref(p)}>View details</a></td><td>{amounts(salesInRange(p.sales))}</td><td>{p.imageCount}<small>images</small></td><td><span className={isDormant(p)?'catalog-listing-activity-dormant':'catalog-listing-activity-current'}>{listingActivity(p)}</span></td><td>{stockLabel(p)}</td><td><span className={statusClass(p)}>{listingStatus(p)}</span></td></tr>:<tr><td><div className="catalog-identity">{!g.standalone&&<button aria-label={`Expand parent ${g.asin}`} aria-expanded={isExpanded} onClick={()=>setExpanded(x=>x.includes(g.asin)?x.filter(a=>a!==g.asin):[...x,g.asin])}><ChevronRight size={16} style={{transform:isExpanded?'rotate(90deg)':undefined}}/></button>}<ProductThumbnail src={g.parent?.image} title={g.parent?.title || g.asin}/><span><b>{g.parent?.title||g.asin}</b><small>{g.asin}{g.parent?` · SKU: ${g.parent.sku}`:''}</small></span></div></td><td><span className="catalog-badge">{g.standalone?'Standalone / unconfirmed':'Parent ASIN'}</span></td><td><span className="catalog-attribute-summary">{attrs(g.parent)}</span><small>{g.children.length} connected child listings</small><a className="catalog-detail-trigger" href={detailHref(g.parent||g.children[0])}>View details</a></td><td>{amounts(familySales)}{!g.standalone&&<small>Family total</small>}</td><td>{g.parent?.imageCount??'—'}{g.parent&&<small>images</small>}</td><td><span className={g.parent&&isDormant(g.parent)?'catalog-listing-activity-dormant':g.parent?'catalog-listing-activity-current':''}>{g.parent?listingActivity(g.parent):'Expand for child listings'}</span></td><td>{g.parent?stockLabel(g.parent):'Not returned'}</td><td><span className={statusClass(g.parent)}>{listingStatus(g.parent)}</span></td></tr>}</Fragment>;})}</tbody></table></div>{!rows.length&&<p>No matching products returned in this catalog.</p>}<nav className="catalog-pagination" aria-label="Product pagination"><span>Showing {rows.length?(currentPage-1)*pageSize+1:0}–{Math.min(currentPage*pageSize,rows.length)} of {rows.length} products · 15 per page</span><button disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous</button><label className="catalog-page-select">Page <select aria-label="Go to product page" value={currentPage} onChange={e=>setPage(Number(e.target.value))}>{Array.from({length:maxPage},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select> of {maxPage}</label><button disabled={currentPage===maxPage} onClick={()=>setPage(currentPage+1)}>Next</button></nav></>}
  </section></>;
}
