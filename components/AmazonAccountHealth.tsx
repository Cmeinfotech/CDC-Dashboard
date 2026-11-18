'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import KpiCard from './KpiCard';
import AccountHealthStatus from './AccountHealthStatus';
import { Activity, ShieldCheck, ChartNoAxesColumn, RefreshCw, Download } from 'lucide-react';
import { useGlobalDateRange } from './GlobalDateRange';

type HealthValue = {
  rate?: number;
  orderCount?: number;
  status?: string;
  targetValue?: number;
  targetCondition?: string;
  reportingDateRange?: { reportingDateFrom?: string; reportingDateTo?: string };
  defectsCount?: number;
  warningsCount?: number;
  ahrScore?: number;
  ahrStatus?: string;
  afn?: HealthValue;
  mfn?: HealthValue;
  claims?: { count?: number; status?: string };
  chargebacks?: { count?: number; status?: string };
  negativeFeedback?: { count?: number; status?: string };
  orderWithDefects?: { count?: number; status?: string };
  [key: string]: unknown;
};
type Metric = { category: string; value: HealthValue | HealthValue[] };
type HealthReport = {
  capturedAt: string;
  marketplaceId: string;
  reportType?: string;
  reportId?: string;
  accountStatuses: { marketplaceId: string; status: string }[];
  performanceMetrics: { marketplaceId: string; metrics: Metric[] }[];
};
type HealthState = { data: HealthReport | null; running: boolean; progress: { status: string; error?: string } | null };
type ViewRow = { field?: string; metric: string; current: string; target: string; status: string; breakdown?: string[] };

const POLICY_FIELDS = [
  ['Suspected intellectual property violations', 'suspectedIntellectualPropertyViolations'],
  ['Received intellectual property complaints', 'receivedIntellectualPropertyComplaints'],
  ['Product authenticity customer complaints', 'productAuthenticityCustomerComplaints'],
  ['Product condition customer complaints', 'productConditionCustomerComplaints'],
  ['Food and product safety issues', 'foodAndProductSafetyIssues'],
  ['Listing policy violations', 'listingPolicyViolations'],
  ['Restricted product policy violations', 'restrictedProductPolicyViolations'],
  ['Customer product reviews policy violations', 'customerProductReviewsPolicyViolations'],
  ['Other policy violations', 'otherPolicyViolations'],
  ['Product safety customer complaints', 'productSafetyCustomerComplaints'],
  ['Document requests', 'documentRequests'],
] as const;

const STANDARD_METRIC_LABELS: Record<string, string> = {
  lateShipmentRate: 'Late shipment rate',
  preFulfillmentCancellationRate: 'Pre-fulfillment cancellation rate',
  validTrackingRate: 'Valid tracking rate',
  invoiceDefectRate: 'Invoice defect rate',
  onTimeDeliveryRate: 'On-time delivery rate',
  unitOnTimeDeliveryRate: 'Unit on-time delivery rate',
};

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const niceLabel = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
function valueFor(metrics: Metric[], category: string): HealthValue | undefined {
  const found = metrics.find(metric => metric.category === category)?.value;
  return Array.isArray(found) ? found[0] : found;
}

function countFrom(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.defectsCount === 'number' ? record.defectsCount : typeof record.warningsCount === 'number' ? record.warningsCount : null;
}
function targetText(metric?: HealthValue) {
  if (typeof metric?.targetValue !== 'number') return 'Not returned by Amazon';
  const sign = metric.targetCondition === 'GREATER_THAN' ? '>' : metric.targetCondition === 'LESS_THAN' ? '<' : metric.targetCondition === 'EQUALS' ? '=' : metric.targetCondition || '';
  return sign + ' ' + (typeof metric.rate === 'number' ? percent(metric.targetValue) : metric.targetValue);
}
function measuredRate(metric: HealthValue | undefined) { return typeof metric?.rate === 'number' ? percent(metric.rate) : 'Not returned by Amazon'; }
function countText(value: unknown) { return typeof value === 'number' ? String(value) : 'Not returned by Amazon'; }

export default function AmazonAccountHealth() {
  const { startDate, endDate } = useGlobalDateRange();
  const requestVersion = useRef(0);
  const [state, setState] = useState<HealthState | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const query = new URLSearchParams({ startDate, endDate });
      const response = await fetch(`/api/amazon/account-health?${query}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      if (version !== requestVersion.current) return;
      setState(body); setError('');
    } catch (caught) { if (version === requestVersion.current) setError(caught instanceof Error ? caught.message : 'Account Health unavailable.'); }
  }, [startDate, endDate]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!state?.running && !pulling) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [state?.running, pulling, load]);
  async function pullLatest() {
    setPulling(true);
    try {
      const response = await fetch('/api/amazon/account-health', { method: 'POST' });
      const body = await response.json();
      if (!response.ok && response.status !== 202) throw Error(body.error || 'Amazon pull could not start.');
      setState(current => current ? { ...current, running: true, progress: { status: 'IN_QUEUE' } } : { data: null, running: true, progress: { status: 'IN_QUEUE' } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Amazon pull could not start.'); }
    finally { setPulling(false); }
  }
  async function exportExcel() {
    if (!state?.data) return;
    setExporting(true);
    try {
      const [{ accountHealthWorkbook }, XLSX] = await Promise.all([import('../services/accountHealthWorkbook.mjs'), import('xlsx')]);
      let aToZClaims = { available: false as boolean, events: [] as { dateFiled: string | null; orderId: string | null; amount: number | null; currency: string | null }[], reason: 'Amazon claim financial events were unavailable during export.' as string };
      try { const response = await fetch('/api/amazon/account-health/claims', { cache: 'no-store' }); if (response.ok) aToZClaims = await response.json(); } catch { /* Explicit availability is included in export. */ }
      XLSX.writeFile(accountHealthWorkbook({ ...state.data, aToZClaims }), 'Amazon-Account-Health-' + state.data.marketplaceId + '-' + state.data.capturedAt.slice(0, 10) + '.xlsx');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Excel export failed.'); }
    finally { setExporting(false); }
  }
  const metrics = useMemo(() => {
    const report = state?.data;
    return report?.performanceMetrics.find(item => item.marketplaceId === report.marketplaceId)?.metrics || [];
  }, [state?.data]);
  const rating = valueFor(metrics, 'accountHealthRating');
  const odr = valueFor(metrics, 'orderDefectRate');
  const totalPolicyViolations = valueFor(metrics, 'totalPolicyViolations');
  const policyRows = POLICY_FIELDS.map(([label, category]) => { const metric = valueFor(metrics, category); return { label, category, metric, count: countFrom(metric) }; });
  const totalPolicyCount = countFrom(totalPolicyViolations) ?? policyRows.reduce((sum, row) => sum + (row.count ?? 0), 0);
  const policyStatus = totalPolicyViolations?.status || (policyRows.some(row => row.metric?.status === 'BAD') ? 'BAD' : 'GOOD');

  const performanceRows: ViewRow[] = metrics.flatMap(metric => {
    if (['lateShipmentRateList', 'orderDefectRate', 'onTimeDeliveryRate', 'unitOnTimeDeliveryRate', 'businessHourDeliveryRate', 'policyViolationWarnings'].includes(metric.category)) return [];
    const label = STANDARD_METRIC_LABELS[metric.category] || niceLabel(metric.category);
    const values = Array.isArray(metric.value) ? metric.value : [metric.value];
    if (metric.category === 'accountHealthRating') return values.map(value => ({
      field: 'accountHealthRating.ahrScore', metric: `${label} score`, current: value.ahrScore == null ? 'Not returned' : String(value.ahrScore),
      target: 'Not returned', status: value.ahrStatus || 'Not returned',
    }));
    if (POLICY_FIELDS.some(([, category]) => category === metric.category)) return [];
    return values.map((value, index) => ({
      field: `${metric.category}.rate`, metric: values.length > 1 ? `${label} — period ${index + 1}` : label,
      current: typeof value.rate === 'number' ? percent(value.rate) : value.defectsCount != null ? countText(value.defectsCount) : value.warningsCount != null ? countText(value.warningsCount) : 'Not returned',
      target: targetText(value), status: value.status || (value.ahrStatus as string | undefined) || 'Not returned',
    }));
  });

  const deliveryRows: ViewRow[] = [
    { category: 'onTimeDeliveryRate', label: 'On-Time Delivery Rate' },
  ].map(({ category, label }) => {
    const value = valueFor(metrics, category);
    return {
      field: `${category}.rate`,
      metric: label,
      current: measuredRate(value),
      target: targetText(value),
      status: value?.status || 'Not returned by Amazon',
    };
  });

  const componentRows: ViewRow[] = [
    { metric: 'Order defect rate', key: 'orderWithDefects' },
    { metric: 'A-to-z claims', key: 'claims' },
    { metric: 'Chargebacks', key: 'chargebacks' },
    { metric: 'Negative feedback', key: 'negativeFeedback' },
  ].map(({ metric, key }) => {
    const values = [odr?.afn?.[key], odr?.mfn?.[key]] as ({ count?: number; status?: string } | undefined)[];
    const counts = values.map(value => value?.count);
    const current = counts.every((count): count is number => typeof count === 'number')
      ? String(counts.reduce((sum, count) => sum + count, 0)) : 'Not returned by Amazon';
    const targets = [targetText(odr?.afn), targetText(odr?.mfn)];
    return {
      field: `orderDefectRate.${key === 'orderWithDefects' ? 'rate' : `${key}.count`}`,
      metric: `${metric} — FBA + FBM`, current,
      breakdown: (['mfn', 'afn'] as const).map(channel => {
        const channelValue = odr?.[channel];
        const count = (channelValue?.[key] as { count?: number } | undefined)?.count;
        const orders = channelValue?.orderCount;
        const rate = typeof count === 'number' && typeof orders === 'number' && orders > 0
          ? percent(count / orders) : 'Percentage unavailable';
        return `${channel === 'mfn' ? 'FBM' : 'FBA'}: ${countText(count)} (${rate})`;
      }),
      target: key === 'orderWithDefects' ? [...new Set(targets)].join(' / ') : 'Not returned by Amazon',
      status: [...new Set(values.map(value => value?.status || 'Not returned by Amazon'))].join(' / '),
    };
  });

  function showTable(id: string) {
    const field = id === 'account-health-metrics' ? 'accountHealthRating.ahrScore' : id === 'account-health-odr' ? 'orderDefectRate.rate' : 'totalPolicyViolations.defectsCount';
    window.location.href = `/amazon/account-health/details?field=${encodeURIComponent(field)}`;
  }

  return <section aria-label="Amazon Account Health" className="account-health-panel account-health-dashboard">
    <div className="account-health-head">
      <div><h2>Account health dashboard</h2>{state?.data?.capturedAt && <p className="account-health-updated"><span aria-hidden="true" />Last updated {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(state.data.capturedAt))}</p>}</div>
      <div className="account-health-actions"><button className="account-health-export dashboard-export-button" disabled={pulling || state?.running} onClick={() => void pullLatest()}><RefreshCw size={14} aria-hidden="true" />{pulling || state?.running ? 'Pulling from Amazon…' : 'Pull latest from Amazon'}</button><button className="account-health-export dashboard-export-button" disabled={!state?.data || exporting} onClick={() => void exportExcel()}><Download size={14} aria-hidden="true" />{exporting ? 'Exporting…' : 'Export Excel (.xlsx)'}</button></div>
    </div>
    {error && <p role="alert" className="account-health-error">{error}</p>}
    {state?.running && <p role="status" className="account-health-run-status">Amazon is generating the report. Saved data remains visible until the pull completes.</p>}
    {state?.progress?.error && <p role="alert" className="account-health-error">{state.progress.error}</p>}
    {!state ? <p>Loading Account Health…</p> : !state.data ? <p>{startDate || endDate ? 'No saved Amazon Account Health snapshot is available in this date range. Choose another range.' : 'No saved Amazon Account Health report is available yet.'}</p> : <>
      <div className="account-health-kpis account-health-preview-kpis">
        <KpiCard title="Account Health Rating" count={rating?.ahrScore == null ? '—' : String(rating.ahrScore)} subtitle={<AccountHealthStatus compact status={rating?.ahrStatus || 'Not returned'} />} className="account-health-kpi rating" onClick={() => showTable('account-health-metrics')} />
        <KpiCard title="ODR — FBA" count={measuredRate(odr?.afn)} subtitle={<AccountHealthStatus compact status={odr?.afn?.status || 'Not returned'} />} className="account-health-kpi odr" onClick={() => showTable('account-health-odr')} />
        <KpiCard title="ODR — FBM" count={measuredRate(odr?.mfn)} subtitle={<AccountHealthStatus compact status={odr?.mfn?.status || 'Not returned'} />} className="account-health-kpi odr" onClick={() => showTable('account-health-odr')} />
        <KpiCard title="Policy compliance" count={String(totalPolicyCount)} subtitle={<AccountHealthStatus compact status={policyStatus} />} className="account-health-kpi policy" onClick={() => showTable('account-health-policy')} />
      </div>

      <div className="account-health-table-pair health-modern-pair">
        <HealthSection id="account-health-metrics" title="Performance metrics">
          <HealthMetricTable rows={[...performanceRows, ...deliveryRows]} valueLabel="Performance" />
        </HealthSection>
        <HealthSection id="account-health-odr" title="Order defects (ODR)">
          <HealthMetricTable rows={componentRows} valueLabel="Count / Percentage" channelNote />
        </HealthSection>
      </div>
      <HealthSection id="account-health-policy" title="Policy compliance">
        <div className="health-policy-toolbar"><span>{policyRows.length} policy types</span><span className="health-policy-alert">{policyRows.filter(row => row.metric?.status === 'BAD').length} needing attention</span></div>
        <HealthMetricTable valueLabel="Reported count" rows={[
          ...[...policyRows].sort((a, b) => Number(b.metric?.status === 'BAD') - Number(a.metric?.status === 'BAD')).map(row => ({ field: row.category + '.defectsCount', metric: row.label, current: row.count == null ? 'Not returned' : String(row.count), target: targetText(row.metric), status: row.metric?.status || 'Not returned' })),
        ]} />
      </HealthSection>
    </>}
  </section>;
}

function HealthSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} style={{ scrollMarginTop: 90 }} className="account-health-preview-section"><h3 id={`${id}-title`}><span className="account-health-section-icon" aria-hidden="true">{id === 'account-health-policy' ? <ShieldCheck size={17} /> : id === 'account-health-odr' ? <ChartNoAxesColumn size={17} /> : <Activity size={17} />}</span>{title}</h3>{children}</section>;
}

function MetricValue({ value }: { value: string }) {
  return /not returned/i.test(value) ? <span className="account-health-unavailable" title="Amazon has not returned this value.">Unavailable</span> : <>{value}</>;
}

function HealthMetricTable({ rows, valueLabel, channelNote = false }: { rows: ViewRow[]; valueLabel: string; channelNote?: boolean }) {
  return <div className="health-modern-table-wrap"><table className="health-modern-table"><thead><tr><th scope="col">Metric</th><th scope="col">{valueLabel}</th><th scope="col">Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.field || row.metric} data-health-status={row.status}>
    <td>{row.field ? <a href={`/amazon/account-health/details?field=${encodeURIComponent(row.field)}`} className="health-modern-metric">{row.metric.replace(' — FBA + FBM', '')}</a> : <span className="health-modern-metric">{row.metric}</span>}{channelNote && <small className="health-modern-channel">FBA + FBM</small>}</td>
    <td><strong className="health-modern-value"><MetricValue value={row.current} /></strong>{row.breakdown?.map(detail => <small key={detail} className="health-modern-target">{detail}</small>)}<small className="health-modern-target">Target <MetricValue value={row.target} /></small></td>
    <td><AccountHealthStatus compact status={row.status} /></td>
  </tr>)}</tbody></table></div>;
}
