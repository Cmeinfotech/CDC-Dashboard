import fs from 'node:fs/promises';
import path from 'node:path';
import { monitorRoot, atomicJson, readJson } from './amazonMonitorStore.mjs';
export async function saveHealthSnapshot(data) {
  if (!data?.reportId || !/^\d+$/.test(String(data.reportId)) || !data.capturedAt) throw Error('Invalid health snapshot metadata.');
  const file = path.join(monitorRoot(), 'account-health-history', `${data.reportId}.json`);
  if (!await readJson(file)) await atomicJson(file, data);
}
export async function healthTrendRows(current) {
  const folder = path.join(monitorRoot(), 'account-health-history');
  const files = await fs.readdir(folder).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
  const snapshots = (await Promise.all(files.filter(f => /^\d+\.json$/.test(f)).map(f => readJson(path.join(folder, f))))).filter(Boolean);
  if (current && !snapshots.some(s => s.reportId === current.reportId)) snapshots.push(current);
  const weekly = new Map();
  for (const snapshot of snapshots) for (const market of snapshot.performanceMetrics || []) {
    if (current?.marketplaceId && market.marketplaceId !== current.marketplaceId) continue;
    const date = new Date(snapshot.capturedAt); if (!Number.isFinite(date.getTime())) continue;
    date.setUTCHours(0, 0, 0, 0); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const week = date.toISOString().slice(0, 10), key = `${market.marketplaceId}:${week}`;
    const metric = name => market.metrics?.find(m => m.category === name)?.value;
    const ahr = metric('accountHealthRating'), odr = metric('orderDefectRate');
    const row = { 'Week starting (UTC)': week, Marketplace: market.marketplaceId, 'Snapshot at (UTC)': snapshot.capturedAt, 'Report ID': snapshot.reportId, 'AHR score': ahr?.ahrScore ?? '', 'AHR status': ahr?.ahrStatus ?? '', 'ODR FBA': odr?.afn?.rate ?? '', 'ODR FBM': odr?.mfn?.rate ?? '', 'ODR period from (FBA)': odr?.afn?.reportingDateRange?.reportingDateFrom ?? '', 'ODR period to (FBA)': odr?.afn?.reportingDateRange?.reportingDateTo ?? '', 'ODR period from (FBM)': odr?.mfn?.reportingDateRange?.reportingDateFrom ?? '', 'ODR period to (FBM)': odr?.mfn?.reportingDateRange?.reportingDateTo ?? '' };
    if (!weekly.has(key) || weekly.get(key)['Snapshot at (UTC)'] < snapshot.capturedAt) weekly.set(key, row);
  }
  const rows = [...weekly.values()].sort((a,b) => a.Marketplace.localeCompare(b.Marketplace) || a['Week starting (UTC)'].localeCompare(b['Week starting (UTC)']));
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index], previous = rows[index - 1];
    const consecutive = previous?.Marketplace === row.Marketplace && Date.parse(row['Week starting (UTC)']) - Date.parse(previous['Week starting (UTC)']) === 7 * 86400000;
    row['AHR change vs previous week'] = consecutive && typeof row['AHR score'] === 'number' && typeof previous['AHR score'] === 'number' ? row['AHR score'] - previous['AHR score'] : '';
    for (const channel of ['FBA', 'FBM']) row[`ODR ${channel} change (percentage points)`] = consecutive && typeof row[`ODR ${channel}`] === 'number' && typeof previous[`ODR ${channel}`] === 'number' ? (row[`ODR ${channel}`] - previous[`ODR ${channel}`]) * 100 : '';
    row['Trend availability'] = consecutive ? 'Previous week snapshot available; ODR reporting windows may differ' : 'No previous-week snapshot; weekly change unavailable';
  }
  return rows;
}
