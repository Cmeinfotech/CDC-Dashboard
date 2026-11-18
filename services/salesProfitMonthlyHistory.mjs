import { summarizeSalesProfitRows } from './liveSalesProfit.mjs';
import { financePeriodSummary } from './salesProfitFinanceSummary.mjs';
export function sixMonthSalesProfitRange(end = new Date().toISOString().slice(0,10)) {
  const d=new Date(end), y=d.getUTCFullYear(), m=d.getUTCMonth()-6;
  const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  return {start:new Date(Date.UTC(y,m,Math.min(d.getUTCDate(),last))).toISOString().slice(0,10),end};
}
export function salesProfitMonthlyHistory(report,finance,ledger,end) {
  const money=value=>value==null?null:Math.round(value*100)/100;
  const range=sixMonthSalesProfitRange(end), groups=new Map();
  for(let d=new Date(range.start.slice(0,7)+'-01');d<=new Date(range.end);d.setUTCMonth(d.getUTCMonth()+1))groups.set(d.toISOString().slice(0,7),[]);
  for(const row of report?.rows||[]){const date=String(row['purchase-date']||'').slice(0,10);if(date>=range.start&&date<=range.end&&row['sales-channel']==='Amazon.com')groups.get(date.slice(0,7))?.push(row);}
  const warehouse=new Map();
  for(const row of ledger?.rows||[]){
    if(row.Location!=='US'||row.Disposition!=='SELLABLE'||!/^\d{2}\/\d{4}$/.test(row.Date||''))continue;
    const month=row.Date.slice(3)+'-'+row.Date.slice(0,2), raw=row['Ending Warehouse Balance'];
    if(raw==null||raw===''||!Number.isFinite(Number(raw)))continue;
    warehouse.set(month,(warehouse.get(month)||0)+Number(raw));
  }
  return { ...range, source:'Amazon order reports + dated finance events + monthly inventory ledger', ordersPulledAt:report?.pulledAt,financePulledAt:finance?.pulledAt,months:[...groups].map(([month,rows])=>{
    const first=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
    const start=range.start>first?range.start:first,end=range.end<last?range.end:last;
    const covered=report&&String(report.coverageStart||report.start||'').slice(0,10)<=start&&String(report.coverageEnd||report.end||'').slice(0,10)>=end;
    const sales=summarizeSalesProfitRows(rows), financial=financePeriodSummary(finance,start,end,report?.marketplaceId||finance?.marketplaceId);
    return {month,label:new Date(first).toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'}),start,end,partial:start!==first||end!==last,orders:covered?sales.total:null,units:covered?sales.units:null,netSales:covered?money(sales.revenue):null,provisionalProfit:covered&&sales.revenue!=null&&sales.units!=null?money(sales.revenue-sales.units*2):null,fees:money(financial.fees==null?null:-financial.fees),refunds:money(financial.refunds==null?null:-financial.refunds),warehouseUnits:warehouse.get(month)??null};
  })};
}
