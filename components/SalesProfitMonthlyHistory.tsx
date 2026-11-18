'use client';
import { useEffect, useState } from 'react';
import { useGlobalDateRange } from './GlobalDateRange';
type Month = { month:string; label:string; start:string; end:string; partial:boolean; orders:number|null; units:number|null; netSales:number|null; provisionalProfit:number|null; fees:number|null; refunds:number|null; warehouseUnits:number|null };
type History = { start:string; end:string; months:Month[]; running:boolean };
const usd=(value:number)=>value.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
export default function SalesProfitMonthlyHistory() {
  const [history,setHistory]=useState<History|null>(null),[error,setError]=useState('');
  const [version,setVersion]=useState(0);
  const {applyDateRange}=useGlobalDateRange();
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/amazon/sales-profit?view=history',{signal:controller.signal,cache:'no-store'}).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||'Six-month history could not be loaded.');return body;}).then(body=>{setHistory(body);setError('');}).catch(caught=>{if(!controller.signal.aborted)setError(caught.message);});
    return()=>controller.abort();
  },[version]);
  useEffect(()=>{if(!history?.running)return;const timer=window.setInterval(()=>setVersion(value=>value+1),30000);return()=>window.clearInterval(timer);},[history?.running]);
  if(error)return <p role="alert">{error}</p>;
  if(!history)return <p role="status">Loading six-month Amazon history…</p>;
  const chart=(title:string,first:keyof Pick<Month,'netSales'|'fees'>,second:keyof Pick<Month,'provisionalProfit'|'refunds'>,firstLabel:string,secondLabel:string)=>{
    const maximum=Math.max(1,...history.months.flatMap(month=>[Math.abs(month[first]??0),Math.abs(month[second]??0)]));
    return <section className="sales-history-chart"><h3>{title}</h3><div className="sales-history-legend"><span><i/>{firstLabel}</span><span><i/>{secondLabel}</span></div>{history.months.map(month=><button type="button" className="sales-history-month" key={month.month} onClick={()=>applyDateRange(month.start,month.end)} title={`View ${month.start} – ${month.end}`}><span className="sales-history-month-label">{month.label}<small>{month.partial?`${month.start.slice(8)}–${month.end.slice(8)} · Partial month`:'Full month'}</small></span><span className="sales-history-bars">{[first,second].map((key,index)=><span className="sales-history-line" key={key}><span className={`sales-history-track${month[key]==null?' is-missing':''}`}><i className={index?'secondary-series':''} style={{width:month[key]==null?'0%':`${Math.abs(month[key])/maximum*100}%`}}/></span><b>{month[key]==null?(history.running?'Pulling…':'Not available'):usd(month[key])}</b></span>)}</span></button>)}</section>;
  };
  return <section className="sales-monthly-history" aria-label="Six-month Amazon history"><header><div><h2>6-month Sales & Profit history</h2><p>{history.start} – {history.end} · Click a month to view its details</p></div>{history.running&&<span role="status">Backfill in progress…</span>}</header><div className="sales-history-charts">{chart('Sales & provisional profit','netSales','provisionalProfit','Net sales','Profit after estimated handling')}{chart('Amazon fees & refunds','fees','refunds','Dated fees · outflows','Dated refunds · outflows')}</div><p className="sales-history-caption">Provisional profit deducts estimated $2/unit handling only. Fees/refunds use posted dates and exclude undated or unassigned events. Partial months show only the dates listed.</p><h3>Month-end FBA warehouse units</h3><div className="sales-history-stock">{history.months.map(month=><div key={month.month}><span>{month.label}</span><strong>{month.warehouseUnits==null?(month.month===history.end.slice(0,7)?'Month not closed':'Not reported'):month.warehouseUnits.toLocaleString()}</strong></div>)}</div><p className="sales-history-caption">US warehouse balances with sellable disposition from Amazon’s monthly ledger. These include reserved stock and differ from fulfillable stock and active listing counts.</p></section>;
}
