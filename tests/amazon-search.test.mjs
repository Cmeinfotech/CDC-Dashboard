import test from 'node:test';
import assert from 'node:assert/strict';
import {searchAmazonRecords} from '../services/amazonSearch.mjs';
test('ASIN and SKU search spans datasets and excludes sibling family matches',()=>{
 const data={catalog:[{asin:'B01N2A5ND6',sku:'ABC-1'},{asin:'OTHER',familyChildAsins:'B01N2A5ND6'}],inventory:[],orderItems:[{asin:'B01N2A5ND6',sku:'ABC-1',orderId:'order-123'}],orders:[]};
 assert.deepEqual(searchAmazonRecords(data,' b01n2a5nd6 ').map(r=>r.source),['catalog','orderItems']);
 assert.equal(searchAmazonRecords(data,'abc-1').length,2);
 assert.equal(searchAmazonRecords(data,'order-123').length,1);
 assert.equal(searchAmazonRecords(data,'missing').length,0);
});
test('FBM stock is shown as stock; order quantities and missing FBA fields remain separate',()=>{
 const data={catalog:[{asin:'A',sku:'S',displayQuantity:99,quantitySource:'Seller listings report',fulfillmentLabel:'Seller fulfilled (FBM)'}],orderItems:[{asin:'A',sku:'S',quantity:2}]};
 const results=searchAmazonRecords(data,'S');
 assert.equal(results[0].stockQuantity,99);
 assert.equal(results[0].stockSource,'Seller listings report');
 assert.equal(results[0].totalQuantity,undefined);
 assert.equal(results[1].stockQuantity,null);
 assert.equal(results[1].orderQuantity,2);
 assert.equal(searchAmazonRecords({inventory:[{asin:'Z',totalQuantity:0}]},'Z')[0].stockQuantity,0);
});
