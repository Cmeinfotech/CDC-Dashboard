import test from 'node:test';
import assert from 'node:assert/strict';
import { limitSalesProfitTestingRange } from '../services/salesProfitTestingRange.mjs';
import { previousSalesProfitPeriod } from '../services/salesProfitHistory.mjs';
test('default testing view splits three-month source into equal current and previous periods',()=>{
 const params=new URLSearchParams();
 const range=limitSalesProfitTestingRange(params,new Date('2026-11-18'));
 assert.equal(params.get('startDate'),'2026-10-04');assert.equal(params.get('endDate'),'2026-11-18');
 assert.deepEqual(previousSalesProfitPeriod(params),{start:'2026-08-19',end:'2026-10-03'});
 assert.equal(range.startDate,'2026-08-18');
});
test('broad saved dates retain selected end while fitting both comparison windows',()=>{
 const params=new URLSearchParams({startDate:'2024-10-15',endDate:'2026-10-31'});
 limitSalesProfitTestingRange(params,new Date('2026-11-18'));
 assert.equal(params.get('endDate'),'2026-10-31');
 assert.ok(previousSalesProfitPeriod(params).start>='2026-08-18');
});
test('short supported global date selections are preserved',()=>{
 const params=new URLSearchParams({startDate:'2026-11-01',endDate:'2026-11-07'});
 limitSalesProfitTestingRange(params,new Date('2026-11-18'));
 assert.equal(params.get('startDate'),'2026-11-01');assert.equal(params.get('endDate'),'2026-11-07');
});
