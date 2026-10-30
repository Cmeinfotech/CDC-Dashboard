const extractPrice = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/-?(?:\d+\.?\d*|\.\d+)/);
  if (!match) return null;
  const amount = Number(match[0]);
  return Number.isFinite(amount) ? amount : null;
};

export function classifyPriceChange(previous, current) {
  const before = extractPrice(previous);
  const after = extractPrice(current);
  if (before == null || after == null || before <= 0) return { severity: 'Unrated', percentChange: null };
  const percentChange = Math.abs((after - before) / before) * 100;
  return {
    severity: percentChange >= 25 ? 'Critical' : percentChange >= 10 ? 'Warning' : 'Low',
    percentChange,
  };
}
