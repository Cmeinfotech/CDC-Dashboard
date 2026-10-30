import { classifyPriceChange } from './priceChangeSeverity.mjs';

const priceNumber = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/-?(?:\d+\.?\d*|\.\d+)/);
  return match ? Number(match[0]) : null;
};

const rankEntries = value => (Array.isArray(value) ? value : [value]).flatMap(entry => {
  if (typeof entry !== 'string') return [];
  const match = entry.match(/^\s*(.*?)\s*:\s*#([\d,]+)\s*$/);
  if (!match) return [];
  const rank = Number(match[2].replace(/,/g, ''));
  return Number.isFinite(rank) && rank > 0 ? [{ label: match[1].trim(), rank }] : [];
});

const severity = percent => percent >= 25 ? 'Critical' : 'Warning';

export function catalogDeclines(change) {
  if (change?.field === 'listing.price') {
    const previous = priceNumber(change.previous);
    const current = priceNumber(change.current);
    if (previous == null || current == null || previous <= 0 || current >= previous) return [];
    const result = classifyPriceChange(previous, current);
    return result.severity === 'Low' ? [] : [{ label: 'Price decreased', previous: change.previous, current: change.current, percentChange: result.percentChange, severity: result.severity }];
  }
  if (change?.field !== 'attributes.sales_rank') return [];
  const previous = new Map(rankEntries(change.previous).map(entry => [entry.label.toLowerCase(), entry]));
  return rankEntries(change.current).flatMap(current => {
    const before = previous.get(current.label.toLowerCase());
    if (!before || current.rank <= before.rank) return [];
    const percentChange = ((current.rank - before.rank) / before.rank) * 100;
    if (percentChange < 10) return [];
    return [{ label: 'Sales rank worsened', category: current.label, previous: before.rank, current: current.rank, percentChange, severity: severity(percentChange) }];
  });
}
