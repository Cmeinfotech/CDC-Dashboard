export function formatSalesProfitValue(metric, value) {
  if(typeof value!=='number'||!Number.isFinite(value))return String(value);
  if(/margin|%/i.test(metric.label))return (value*100).toFixed(2)+'%';
  if(/Units per Order/i.test(metric.label))return value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(/USD|Sales|Profit|Cost|Expenses|Shipping|Promotions|Taxes|Value|Revenue per|Handling|Fees|Refunds \(Posted/i.test(metric.label))return value.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2});
  return value.toLocaleString('en-US',{maximumFractionDigits:0});
}
export function metricChangePresentation(metric,result) {
  const lowerPreferred=/Cancelled|Inactive|Out-of-Stock|Cost|Handling|Fees|Promotions|^Refund \/ Return Orders$|^Refunds \(Posted/i.test(metric.label);
  if(result.isRange && result.currentBounds && result.previousBounds) {
    const a=result.currentBounds,b=result.previousBounds;
    if(b.min<=0)return {direction:'flat',tone:'neutral',label:'N/A',description:'Zero baseline in range'};
    const low=result.margin?(a.min-b.max)*100:(a.min-b.max)/b.max*100;
    const high=result.margin?(a.max-b.min)*100:(a.max-b.min)/b.min*100;
    const direction=low>0?'up':high<0?'down':'flat';
    const tone=direction==='flat'?'neutral':(direction==='up')!==lowerPreferred?'positive':'negative';
    const precision=result.margin?2:1;
    const fmt=value=>(value>0?'+':'')+value.toFixed(precision);
    const label=fmt(low)===fmt(high)?fmt(low):fmt(low)+' to '+fmt(high);
    return {direction,tone,label:label+(result.margin?' pp':'%'),description:direction==='flat'?'Change range':direction==='up'?'Increased · range':'Decreased · range'};
  }
  const signedOutflow=/Fees|Refunds \(Posted/i.test(metric.label);
  const current=signedOutflow&&result.current!=null?Math.abs(result.current):result.current;
  const previous=signedOutflow&&result.previous!=null?Math.abs(result.previous):result.previous;
  const change=current==null||previous==null||(!result.margin&&previous===0)?null:result.margin?(current-previous)*100:(current-previous)/Math.abs(previous)*100;
  const direction=change==null||change===0?'flat':change>0?'up':'down';
  const tone=direction==='flat'?'neutral':(change>0)!==lowerPreferred?'positive':'negative';
  return {direction,tone,label:change==null?'N/A':`${change>0?'+':''}${change.toFixed(result.margin?2:1)}${result.margin?' pp':'%'}`,description:change==null?'No comparison':direction==='flat'?'No change':direction==='up'?'Increased':'Decreased'};
}
