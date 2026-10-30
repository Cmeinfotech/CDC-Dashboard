import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { openAmazonData, sealAmazonData, purgeExpiredAmazonData } from './amazonDataSecurity.mjs';

export const monitorRoot = () => path.resolve(process.env.AMAZON_MONITOR_DATA_DIR || path.join(process.cwd(), 'data-store', 'amazon-monitor'));
export async function readJson(file, fallback = null) {
  try { const text = await fs.readFile(file, 'utf8'); return file.endsWith('.lock') ? JSON.parse(text) : openAmazonData(text, file, fallback); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function atomicJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, sealAmazonData(data, file), { mode: 0o600 });
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await fs.rename(temporary, file); return; }
    catch (error) { if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 19) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
  }
}
export async function acquireLock(name) {
  const root = monitorRoot(); await fs.mkdir(root, { recursive: true });
  const file = path.join(root, `${name}.lock`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const handle = await fs.open(file, 'wx'); await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })); await handle.close(); return async () => { await fs.unlink(file); }; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const lock = await readJson(file);
      try { process.kill(lock.pid, 0); } catch (failure) { if (failure.code === 'ESRCH') { await fs.unlink(file); continue; } throw failure; }
      throw Error('Another Amazon monitoring operation is already running.');
    }
  }
  throw Error('Could not acquire monitoring lock.');
}
export async function commitRun(run) {
  const root = monitorRoot();
  await purgeExpiredAmazonData(root);
  const latest = await readJson(path.join(root, 'latest.json'));
  await atomicJson(path.join(root, 'runs', `${run.id}.json`), run);
  await atomicJson(path.join(root, 'runs', `${run.id}.changes.json`), run.changes || []);
  await atomicJson(path.join(root, 'runs', `${run.id}.summary.json`), { id: run.id, capturedAt: run.capturedAt, source: run.source, baseline: run.baseline, productCount: run.products.length, changeCount: run.changes?.length || 0, unavailableDetails: run.unavailableDetails || [] });
  await atomicJson(path.join(root, 'latest.json'), { id: run.id, capturedAt: run.capturedAt, runIds: [...(latest?.runIds || (latest ? [latest.id] : [])), run.id] });
}
export async function monitorState() {
  const root = monitorRoot();
  const [latest, progress, reviews, automation] = await Promise.all([readJson(path.join(root, 'latest.json')), readJson(path.join(root, 'progress.json')), readJson(path.join(root, 'reviews.json'), {}), readJson(path.join(root, 'automation.json'))]);
  const run = latest ? await readJson(path.join(root, 'runs', `${latest.id}.json`)) : null;
  const ids = latest?.runIds || (latest ? [latest.id] : []);
  const runs = await Promise.all(ids.map(async id => {
    const summary = await readJson(path.join(root, 'runs', `${id}.summary.json`));
    if (summary) return { ...summary, changes: await readJson(path.join(root, 'runs', `${id}.changes.json`), []) };
    return id === run?.id ? run : readJson(path.join(root, 'runs', `${id}.json`));
  }));
  const history = runs.filter(Boolean).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const changes = history.flatMap(item => item.changes || []).map(change => ({ ...change, status: reviews[change.id]?.status || 'Unreviewed', reviewedAt: reviews[change.id]?.reviewedAt || null, linkedAt: reviews[change.id]?.linkedAt || null, activeMapping: reviews[change.id]?.activeMapping || null, audit: reviews[change.id]?.audit || [] }));
  // Keep Amazon snapshots immutable: local acceptance must never alter sync comparisons.
  const mappings = Object.values(reviews).map(review => review.activeMapping).filter(Boolean);
  const dashboardRun = run ? { ...run, products: run.products.map(product => {
    const mapping = mappings.filter(m => m.sku === product.sku && m.asin === product.asin).sort((a,b) => (b.updatedAt || b.mergedAt).localeCompare(a.updatedAt || a.mergedAt))[0];
    if (!mapping || run.capturedAt > mapping.sourceCapturedAt) return product;
    return { ...product, parentAsins: mapping.currentParentAsins, parentage: mapping.currentParentAsins.length ? 'Child' : product.childAsins.length ? 'Parent' : 'Unspecified', activeParentMapping: mapping };
  }) } : null;
  let running = false;
  const lock = await readJson(path.join(root, 'sync.lock'));
  if (lock?.pid) { try { process.kill(lock.pid, 0); running = true; } catch { /* worker no longer running */ } }
  return { run, dashboardRun, progress: progress ? { ...progress, running } : null, changes, automation,
    history: history.map(item => ({ id: item.id, capturedAt: item.capturedAt, source: item.source, baseline: item.baseline, productCount: item.productCount ?? item.products?.length, changeCount: item.changeCount ?? item.changes?.length ?? 0, unavailableDetails: item.unavailableDetails || [] })) };
}
export async function reviewChange(id, status, actor = 'system', reason = '') {
  if (!['Reviewed', 'Unreviewed', 'Linked', 'Merged'].includes(status)) throw Error('Invalid review status.');
  if (['Linked', 'Merged'].includes(status) && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000)) throw Error('Enter a reason of 1 to 1000 characters before confirming the history change.');
  const changeReason = typeof reason === 'string' ? reason.trim() : '';
  const release = await acquireLock('review');
  try {
    const state = await monitorState();
    const change = state.changes.find(change => change.id === id);
    if (!change) throw Error('Change does not exist.');
    if (status === 'Linked' && !['asin', 'family'].includes(change.kind)) throw Error('Only ASIN replacements and parent/child changes can be linked.');
    const file = path.join(monitorRoot(), 'reviews.json'); const reviews = await readJson(file, {});
    const now = new Date().toISOString();
    let activeMapping = reviews[id]?.activeMapping || null;
    const audit = reviews[id]?.audit || [];
    if (status === 'Merged') {
      if (change.kind !== 'family' || change.field !== 'parentAsins' || !Array.isArray(change.current)) throw Error('Select an individual child parent change to activate its current parent.');
      const product = state.run?.products.find(p => p.sku === change.sku && p.asin === change.asin);
      const sameParents = (a,b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
      if (!product || !sameParents(product.parentAsins, change.current)) throw Error('This change is outdated. Review the latest parent relationship before merging.');
      if (!activeMapping || activeMapping.direction === 'reverse') {
        activeMapping = { sku: change.sku, asin: change.asin, previousParentAsins: change.previous, currentParentAsins: change.current, changeId: id, mergedAt: now, updatedAt: now, direction: 'forward', sourceCapturedAt: state.run.capturedAt, reason: changeReason };
        audit.push({ action: 'Merged', actor, at: now, reason: changeReason, previousParentAsins: change.previous, currentParentAsins: change.current });
      }
    }
    if (status === 'Linked' && status !== (reviews[id]?.status || 'Unreviewed')) audit.push({ action: status, actor, at: now, reason: changeReason, asin: change.asin, sku: change.sku, title: change.title, field: change.field, previous: change.previous, current: change.current, previousParentAsins: change.previousParentAsins || [], currentParentAsins: change.currentParentAsins || [] });
    if (status !== 'Merged' && status !== 'Linked' && status !== (reviews[id]?.status || 'Unreviewed')) audit.push({ action: status, actor, at: now, asin: change.asin, sku: change.sku, title: change.title, field: change.field, previous: change.previous, current: change.current, previousParentAsins: change.previousParentAsins || [], currentParentAsins: change.currentParentAsins || [] });
    reviews[id] = { status, reason: ['Linked', 'Merged'].includes(status) ? changeReason : reviews[id]?.reason || '', reviewedAt: status !== 'Unreviewed' ? now : null, linkedAt: ['Linked','Merged'].includes(status) ? reviews[id]?.linkedAt || now : reviews[id]?.linkedAt || null, activeMapping, audit }; await atomicJson(file, reviews);
  } finally { await release(); }
}

export async function reviewChanges(ids, status, actor = 'system') {
  if (!Array.isArray(ids) || !ids.length || ids.length > 5000 || !ids.every(id => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id))) throw Error('Invalid review change IDs.');
  if (!['Reviewed', 'Unreviewed'].includes(status)) throw Error('Invalid bulk review status.');
  const release = await acquireLock('review');
  try {
    const state = await monitorState(); const changeById = new Map(state.changes.map(change => [change.id, change])); const known = new Set(changeById.keys());
    if (ids.some(id => !known.has(id))) throw Error('One or more changes no longer exist. Refresh and retry.');
    const file = path.join(monitorRoot(), 'reviews.json'); const reviews = await readJson(file, {}); const now = new Date().toISOString();
    for (const id of new Set(ids)) {
      const prior = reviews[id] || {}; const change = changeById.get(id); const audit = prior.audit || [];
      if (change && status !== (prior.status || 'Unreviewed')) audit.push({ action: status, actor, at: now, asin: change.asin, sku: change.sku, title: change.title, field: change.field, previous: change.previous, current: change.current, previousParentAsins: change.previousParentAsins || [], currentParentAsins: change.currentParentAsins || [] });
      reviews[id] = { ...prior, status, reviewedAt: status === 'Reviewed' ? now : null, linkedAt: prior.linkedAt || null, activeMapping: prior.activeMapping || null, audit, actor };
    }
    await atomicJson(file, reviews);
  } finally { await release(); }
}

export async function dismissedNotifications() {
  return readJson(path.join(monitorRoot(), 'notifications.json'), {});
}

export async function dismissNotification(id, actor) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9:_-]{1,200}$/.test(id)) throw Error('Invalid notification ID.');
  if (typeof actor !== 'string' || !actor.trim()) throw Error('User identity is required.');
  const release = await acquireLock('notifications');
  try {
    const file = path.join(monitorRoot(), 'notifications.json');
    const dismissed = await readJson(file, {});
    dismissed[id] = dismissed[id] || { actor, at: new Date().toISOString() };
    await atomicJson(file, dismissed);
  } finally { await release(); }
}

export async function reverseMerge(id, actor) {
  if (typeof actor !== 'string' || !actor) throw Error('Administrator identity is required.');
  const release = await acquireLock('review');
  try {
    const state = await monitorState();
    const change = state.changes.find(c => c.id === id);
    const mapping = change?.activeMapping;
    if (!mapping || change.status !== 'Merged' || mapping.direction === 'reverse' || !Array.isArray(mapping.previousParentAsins)) throw Error('This merge cannot be reversed.');
    const product = state.dashboardRun?.products.find(p => p.sku === mapping.sku && p.asin === mapping.asin);
    if (!product?.activeParentMapping || product.activeParentMapping.changeId !== id) throw Error('Merge is no longer active. Refresh and review the latest mapping.');
    const raw = state.run.products.find(p => p.sku === mapping.sku && p.asin === mapping.asin);
    if (JSON.stringify([...raw.parentAsins].sort()) !== JSON.stringify([...mapping.currentParentAsins].sort())) throw Error('A newer Amazon relationship exists. Review it before reversing.');
    const file = path.join(monitorRoot(), 'reviews.json');
    const reviews = await readJson(file, {});
    const now = new Date().toISOString();
    const event = { action: 'Reversed', actor, at: now, previousParentAsins: mapping.currentParentAsins, currentParentAsins: mapping.previousParentAsins };
    const prior = reviews[id];
    // One atomic record preserves the mapping and its complete audit trail together.
    reviews[id] = { ...prior, status: 'Reversed', linkedAt: null, reviewedAt: now,
      activeMapping: { ...mapping, previousParentAsins: mapping.currentParentAsins, currentParentAsins: mapping.previousParentAsins, direction: 'reverse', updatedAt: now, sourceCapturedAt: state.run.capturedAt },
      audit: [...(prior.audit?.length ? prior.audit : [{ action: 'Merged', actor: 'Not recorded (legacy merge)', at: mapping.mergedAt, previousParentAsins: mapping.previousParentAsins, currentParentAsins: mapping.currentParentAsins }]), event] };
    await atomicJson(file, reviews);
  } finally { await release(); }
}
