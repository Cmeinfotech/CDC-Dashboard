export function metricBounds(value) {
  if(typeof value==='number'&&Number.isFinite(value))return {min:value,max:value};
  if(typeof value!=='string')return null;
  const match=value.replaceAll(',','').match(/^(-?\d+(?:\.\d+)?)–(-?\d+(?:\.\d+)?)$/);
  if(!match)return null;
  const min=Number(match[1]),max=Number(match[2]);
  return min<=max?{min,max}:null;
}
export function metricComparison(metric) {
  const currentBounds=metricBounds(metric.current),previousBounds=metricBounds(metric.previous);
  const current=currentBounds?(currentBounds.min+currentBounds.max)/2:null;
  const previous=previousBounds?(previousBounds.min+previousBounds.max)/2:null;
  const maximum=Math.max(Math.abs(currentBounds?.min??0),Math.abs(currentBounds?.max??0),Math.abs(previousBounds?.min??0),Math.abs(previousBounds?.max??0));
  const margin=/margin/i.test(metric.label);
  const change=current==null||previous==null||(!margin&&previous===0)?null:margin?(current-previous)*100:(current-previous)/Math.abs(previous)*100;
  return {current,previous,currentBounds,previousBounds,isRange:Boolean(currentBounds&&currentBounds.min!==currentBounds.max||previousBounds&&previousBounds.min!==previousBounds.max),currentWidth:current==null?null:maximum?Math.abs(current)/maximum*100:0,previousWidth:previous==null?null:maximum?Math.abs(previous)/maximum*100:0,change,margin};
}
