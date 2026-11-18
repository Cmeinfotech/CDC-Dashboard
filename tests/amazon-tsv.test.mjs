import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmazonTsv } from '../services/amazonTsv.mjs';
test('Amazon TSV preserves leading product-title quotes without merging physical rows',()=>{
 const text='SKU\tTitle\tQuantity\r\nA\t"Quoted title\t1\r\nB\tNormal title\t2\r\nC\tAnother " quote\t0\r\n';
 const rows=parseAmazonTsv(text);assert.equal(rows.length,3);assert.equal(rows[0].Title,'"Quoted title');assert.equal(rows[2].Quantity,'0');
});
test('TSV mismatched field counts fail explicitly rather than dropping or shifting data',()=>{
 assert.throws(()=>parseAmazonTsv('A\tB\n1\t2\t3'),/expected 2/);
 assert.equal(parseAmazonTsv('A\tB\n1\t\n')[0].B,'');
});
test('quoted ledger headers and literal embedded title quotes remain separate rows',()=>{
 const rows=parseAmazonTsv('"Date"\t"Title"\t"Balance"\n"05/2026"\t"Title with "embedded" quote"\t"12"\n"06/2026"\t"Next title"\t"20"');
 assert.equal(rows.length,2);assert.equal(rows[0].Date,'05/2026');assert.equal(rows[0].Title,'Title with "embedded" quote');assert.equal(rows[1].Balance,'20');
});
