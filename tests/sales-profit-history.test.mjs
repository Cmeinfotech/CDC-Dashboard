import test from 'node:test';
import assert from 'node:assert/strict';
import { sixMonthSalesProfitRange, salesProfitMonthlyHistory } from '../services/salesProfitMonthlyHistory.mjs';
import { selectStockSnapshotDate } from '../services/salesProfitHistory.mjs';
import { liveSalesProfit } from '../services/liveSalesProfit.mjs';
test('six calendar months clamps month-end dates without rolling into the next month',()=>{
 assert.deepEqual(sixMonthSalesProfitRange('2026-11-18'),{start:'2026-05-18',end:'2026-11-18'});
 assert.equal(sixMonthSalesProfitRange('2026-08-31').start,'2026-02-28');
});
test('stock history uses only the latest actual snapshot inside the previous period',()=>{
 assert.equal(selectStockSnapshotDate(['2026-10-15','2026-10-19','2026-11-18'],'2026-09-20','2026-10-19'),'2026-10-19');
 assert.equal(selectStockSnapshotDate(['2026-11-18'],'2026-09-20','2026-10-19'),null);
});
test('monthly history retains partial-month scope and does not mix Canadian or unsellable warehouse units',()=>{
 const ledger={rows:[{Date:'05/2026',Location:'US',Disposition:'SELLABLE','Ending Warehouse Balance':'10'},{Date:'05/2026',Location:'CA',Disposition:'SELLABLE','Ending Warehouse Balance':'900'},{Date:'05/2026',Location:'US',Disposition:'DEFECTIVE','Ending Warehouse Balance':'50'}]};
 const h=salesProfitMonthlyHistory({rows:[],coverageStart:'2025-01-01',coverageEnd:'2026-11-18'},null,ledger,'2026-11-18');
 assert.equal(h.months.length,7);assert.equal(h.months[0].start,'2026-05-18');assert.equal(h.months[0].warehouseUnits,10);
 assert.equal(h.months[0].fees,null);assert.equal(h.months[0].netSales,0);assert.equal(h.months.at(-1).partial,true);
});
test('archived stock quantities populate genuine previous-period comparison values',()=>{
 const product=quantity=>({listing:{status:'Active',quantity}});
 const h=liveSalesProfit(null,null,{products:[product(5),product(0)],previousSnapshot:{products:[product(5),product(6),product(0)]}},new URLSearchParams());
 const metric=label=>h.metrics.find(m=>m.label===label);
 assert.equal(metric('Active & In-Stock Listings').previous,2);assert.equal(metric('Active & Out-of-Stock Listings').previous,1);
 assert.equal(metric('In-Stock % of Active').previous,2/3);
});
