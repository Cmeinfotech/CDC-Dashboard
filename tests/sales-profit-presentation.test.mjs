import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSalesProfitValue, metricChangePresentation } from '../services/salesProfitPresentation.mjs';
import { metricComparison } from '../services/metricComparison.mjs';
const change=(label,current,previous)=>metricChangePresentation({label,current,previous},metricComparison({label,current,previous}));
test('counts, money, ratios and rates use consistent formats',()=>{
 assert.equal(formatSalesProfitValue({label:'Total Orders'},12345),'12,345');
 assert.equal(formatSalesProfitValue({label:'Net Sales'},12345),'$12,345.00');
 assert.equal(formatSalesProfitValue({label:'Units per Order'},1.1),'1.10');
 assert.equal(formatSalesProfitValue({label:'Profit Margin'},0.1234),'12.34%');
});
test('cancellations rising are red; falling are green',()=>{
 assert.equal(change('Cancelled Orders',12,10).tone,'negative');
 assert.equal(change('Cancelled Orders',8,10).tone,'positive');
});
test('signed fee outflows compare magnitudes, not negative-value direction',()=>{
 const increased=change('Amazon Fees (Posted USD)',-120,-100);
 assert.equal(increased.direction,'up');assert.equal(increased.tone,'negative');assert.equal(increased.label,'+20.0%');
 assert.equal(change('Amazon Fees (Posted USD)',-80,-100).tone,'positive');
 assert.equal(change('Net Sales',120,100).tone,'positive');
 assert.equal(change('Net Sales','Unavailable',100).tone,'neutral');
});
test('orders before refunds are favorable when increasing',()=>{
 assert.equal(change('Orders Before Refunds',120,100).tone,'positive');
});
test('bounded previous values render bars and compare the entire interval',()=>{
 const metric={label:'Actual Orders',current:5953,previous:'5,126–5,128'};
 const result=metricComparison(metric);
 assert.ok(result.previousWidth>0);assert.equal(result.isRange,true);
 const change=metricChangePresentation(metric,result);
 assert.equal(change.direction,'up');assert.equal(change.tone,'positive');assert.match(change.description,/range/);
});
