export const isTrackingChange = change => ['asin', 'family'].includes(change.kind);
export const isPreservedChange = change => isTrackingChange(change) && Boolean(change.linkedAt || change.activeMapping || ['Merged', 'Linked', 'Reversed'].includes(change.status) || change.audit?.some(event => ['Merged', 'Reversed'].includes(event.action)));
export const preservedChangeDate = change => change.audit?.at(-1)?.at || change.linkedAt || change.activeMapping?.mergedAt || change.detectedAt;
export const reversalDate = change => change.audit?.filter(event => event.action === 'Reversed').at(-1)?.at || preservedChangeDate(change);
export function trackingDateInRange(value, start, end, timeZone) {
  if (start && end && start > end) return false;
  if (!start && !end) return true;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).formatToParts(date).map(p=>[p.type,p.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return (!start || day >= start) && (!end || day <= end);
}

export function trackingChangeLabel(change) {
  if (change.kind === 'family') return change.field === 'childAsins' ? 'Child ASINs changed' : 'Parent ASIN changed';
  return change.kind === 'asin' ? 'ASIN replacement' : 'Missing listing';
}

export function trackingValue(value) {
  return Array.isArray(value) ? value.join(', ') || 'None returned' : String(value ?? 'Missing');
}

// Show the affected children in the queue; retain full before/after lists for review/export.
export function trackingQueueValues(change) {
  if (change.kind !== 'family' || change.field !== 'childAsins') return [trackingValue(change.previous), trackingValue(change.current)];
  const before = Array.isArray(change.previous) ? change.previous : [];
  const after = Array.isArray(change.current) ? change.current : [];
  return [trackingValue(before.filter(asin => !after.includes(asin))), trackingValue(after.filter(asin => !before.includes(asin)))];
}
