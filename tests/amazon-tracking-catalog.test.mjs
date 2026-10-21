import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogProducts, catalogSales } from '../services/amazonTrackingCatalog.mjs';
const row=(patch={})=>({'sales-channel':'Amazon.com','order-item-id':'1','order-status':'Shipped','item-status':'Shipped',sku:'S',asin:'A',currency:'USD','item-price':'25',quantity:'2','purchase-date':'2026-10-10',...patch});
test('catalog sales use line amount once, deduplicate item IDs and exclude cancellations and other channels',()=>{
 const result=catalogSales([row(),row(),row({'order-item-id':'2','order-status':'Cancelled'}),row({'order-item-id':'3','sales-channel':'Amazon.ca'}),row({'order-item-id':'4','item-price':''})]);
 assert.deepEqual(result.get(JSON.stringify(['S','A'])).USD,{currency:'USD',amount:25,units:2,months:{'2026-10':25}});
});
test('catalog matches SKU and ASIN together, preserves currencies and unavailable data',()=>{
 const products=[{sku:'S',asin:'A',attributes:{color:[{value:'Blue'}]},listing:{},parentAsins:[],childAsins:[]},{sku:'Other',asin:'A',attributes:{},listing:{}}];
 const result=catalogProducts(products,[row(),row({'order-item-id':'2',currency:'CAD','item-price':'9'})]);
 assert.equal(result[0].sales.length,2);assert.equal(result[1].sales.length,0);assert.equal(result[0].status,null);assert.equal(result[0].attributes.color,'Blue');
});
