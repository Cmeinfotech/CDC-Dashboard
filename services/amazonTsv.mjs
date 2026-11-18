// Amazon flat-file reports use literal tab-separated fields, not CSV quote escaping.
// Treat quote characters in product titles as data; validate every physical row.
export function parseAmazonTsv(text) {
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/);
  const rawHeaders=lines.shift().split('\t');
  const quoted=value=>value.length>=2&&value.startsWith('"')&&value.endsWith('"');
  const unquote=value=>quoted(value)?value.slice(1,-1).replaceAll('""','"'):value;
  const quotedColumns=rawHeaders.map(quoted);
  const headers=rawHeaders.map(unquote);
  if(headers.length<2||headers.some(header=>!header)||new Set(headers).size!==headers.length)throw Error('Invalid Amazon TSV header.');
  const rows=[];
  for(let index=0;index<lines.length;index++){
    if(!lines[index])continue;
    const values=lines[index].split('\t');
    if(values.length!==headers.length)throw Error(`Amazon TSV row ${index+2} has ${values.length} fields; expected ${headers.length}. Source was not replaced.`);
    rows.push(Object.fromEntries(headers.map((header,column)=>[header,quotedColumns[column]?unquote(values[column]):values[column]])));
  }
  return rows;
}
