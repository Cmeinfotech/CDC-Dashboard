export function salesProfitTestingRange(now = new Date()) {
  const end=now.toISOString().slice(0,10), d=new Date(end);
  const month=d.getUTCMonth()-3, last=new Date(Date.UTC(d.getUTCFullYear(),month+1,0)).getUTCDate();
  return {startDate:new Date(Date.UTC(d.getUTCFullYear(),month,Math.min(d.getUTCDate(),last))).toISOString().slice(0,10),endDate:end};
}
export function limitSalesProfitTestingRange(params, now = new Date()) {
  const range=salesProfitTestingRange(now), day=86400000;
  const requestedStart=params.get('startDate')||range.startDate, requestedEnd=params.get('endDate')||range.endDate;
  let endDate=requestedEnd>range.endDate?range.endDate:requestedEnd;
  let startDate=requestedStart<range.startDate?range.startDate:requestedStart;
  if(startDate>endDate){startDate=range.startDate;endDate=range.endDate;}
  // Both equal-length periods must fit within the three-month testing dataset.
  // Keep the selected end date; shorten only ranges that have no prior coverage.
  const availableDays=Math.floor((Date.parse(endDate)-Date.parse(range.startDate))/day)+1;
  const maxPeriodDays=Math.floor(availableDays/2);
  const selectedDays=Math.floor((Date.parse(endDate)-Date.parse(startDate))/day)+1;
  if(maxPeriodDays>=1&&selectedDays>maxPeriodDays)startDate=new Date(Date.parse(endDate)-(maxPeriodDays-1)*day).toISOString().slice(0,10);
  params.set('startDate',startDate);params.set('endDate',endDate);
  return range;
}
