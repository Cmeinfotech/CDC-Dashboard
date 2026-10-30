const datasets=['catalog','inventory','orderItems','orders'];
const normalize=value=>String(value??'').trim().toLowerCase();
export function searchAmazonRecords(data,query){
 const q=normalize(query);if(!q||!data)return [];
 const all=datasets.flatMap(source=>(data[source]||[]).map(row=>({...row,source})));
 const direct=row=>[row.asin,row.sku].some(value=>normalize(value)===q);
 // Prefer the actual listing, never a sibling containing the ASIN in family metadata.
 const exact=all.filter(direct);
 const results=exact.length?exact:all.filter(row=>[row.asin,row.sku,row.productName,row.orderId].some(value=>normalize(value).includes(q)));
 return results.map(row=>({...row,productDetails:row.asin?'View details':null,
   stockQuantity:row.source==='catalog'?row.displayQuantity:row.source==='inventory'?row.totalQuantity:null,
   stockSource:row.source==='catalog'?row.quantitySource:row.source==='inventory'?'FBA total inventory':null,
   orderQuantity:row.source==='orderItems'?row.quantity:null,
   fulfillmentLabel:row.fulfillmentLabel || row.fulfillment || row.channel,
 }));
}
