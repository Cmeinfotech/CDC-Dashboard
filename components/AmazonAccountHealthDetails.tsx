'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import AccountHealthStatus from './AccountHealthStatus';
import { GlobalDateRangeFilter, useGlobalDateRange } from './GlobalDateRange';

type HealthValue = {
  rate?: number;
  status?: string;
  ahrScore?: number;
  ahrStatus?: string;
  targetValue?: number;
  targetCondition?: string;
  reportingDateRange?: { reportingDateFrom?: string; reportingDateTo?: string };
  orderCount?: number;
  lateShipmentCount?: number;
  cancellationCount?: number;
  shipmentCount?: number;
  validTrackingCount?: number;
  onTimeDeliveryCount?: number;
  shipmentCountWithValidTracking?: number;
  unitOnTimeDeliveryCount?: number;
  totalUnitCount?: number;
  invoiceDefect?: { count?: number };
  orderWithDefects?: { count?: number };
  claims?: { count?: number; status?: string };
  chargebacks?: { count?: number; status?: string };
  negativeFeedback?: { count?: number; status?: string };
  defectsCount?: number;
  warningsCount?: number;
  afn?: HealthValue;
  mfn?: HealthValue;
  [key: string]: unknown;
};
type Metric = { category: string; value: HealthValue | HealthValue[] };
type Report = {
  capturedAt: string;
  marketplaceId: string;
  reportType?: string;
  reportId?: string;
  accountStatuses: { marketplaceId: string; status: string }[];
  performanceMetrics: { marketplaceId: string; metrics: Metric[] }[];
};
type ClaimEvent = { dateFiled: string | null; orderId: string | null; amount: number | null; currency: string | null };
type ClaimData = { available: boolean; events: ClaimEvent[]; reason?: string; truncated?: boolean; source?: string; noClaimsInWindow?: boolean; pending?: boolean; pagesLoaded?: number; capturedAt?: string; reportingRange?: { startDate: string; endDate: string } };
type DetailRow = {
  metric: string;
  subMetric: string;
  target: string;
  current: string;
  status: string;
  numerator: string;
  denominator: string;
  from: string;
  to: string;
  sourceField: string;
  metricId: string;
  headroom?: string;
};
type Section = { title: string; rows: DetailRow[] };
type RowSpec = {
  metric: string;
  category: string;
  field: string;
  id: string;
  subMetric?: 'afn' | 'mfn';
  valueField?: string;
  numeratorField?: string;
  denominatorField?: string;
  rate?: boolean;
};

const ODR_COMPONENTS = [
  { name: 'A-to-z claims', valueField: 'claims', field: 'claims.count', base: 'AH-09-CLM' },
  { name: 'Chargebacks', valueField: 'chargebacks', field: 'chargebacks.count', base: 'AH-09-CB' },
  { name: 'Negative feedback', valueField: 'negativeFeedback', field: 'negativeFeedback.count', base: 'AH-09-NF' },
] as const;

const POLICY_FIELDS = [
  ['Suspected intellectual property violations', 'suspectedIntellectualPropertyViolations', 'AH-07'],
  ['Received intellectual property complaints', 'receivedIntellectualPropertyComplaints', 'AH-07'],
  ['Product authenticity customer complaints', 'productAuthenticityCustomerComplaints', 'AH-07'],
  ['Product condition customer complaints', 'productConditionCustomerComplaints', 'AH-07'],
  ['Food and product safety issues', 'foodAndProductSafetyIssues', 'AH-07'],
  ['Listing policy violations', 'listingPolicyViolations', 'AH-07'],
  ['Restricted product policy violations', 'restrictedProductPolicyViolations', 'AH-07'],
  ['Customer product reviews policy violations', 'customerProductReviewsPolicyViolations', 'AH-07'],
  ['Other policy violations', 'otherPolicyViolations', 'AH-07'],
  ['Product safety customer complaints', 'productSafetyCustomerComplaints', 'AH-07'],
  ['Document requests', 'documentRequests', 'AH-07'],
] as const;

const RATE_SPECS: RowSpec[] = [
  { metric: 'Late shipment rate', category: 'lateShipmentRate', field: 'lateShipmentRate.rate', id: 'AH-16', valueField: 'rate', numeratorField: 'lateShipmentCount', denominatorField: 'orderCount', rate: true },
  { metric: 'Pre-fulfillment cancellation rate', category: 'preFulfillmentCancellationRate', field: 'preFulfillmentCancellationRate.rate', id: 'AH-17', valueField: 'rate', numeratorField: 'cancellationCount', denominatorField: 'orderCount', rate: true },
  { metric: 'Valid tracking rate', category: 'validTrackingRate', field: 'validTrackingRate.rate', id: 'AH-18', valueField: 'rate', numeratorField: 'validTrackingCount', denominatorField: 'shipmentCount', rate: true },
  { metric: 'On-time delivery rate — shipments', category: 'onTimeDeliveryRate', field: 'onTimeDeliveryRate.rate', id: 'AH-19', valueField: 'rate', numeratorField: 'onTimeDeliveryCount', denominatorField: 'shipmentCountWithValidTracking', rate: true },
  { metric: 'Unit on-time delivery rate', category: 'unitOnTimeDeliveryRate', field: 'unitOnTimeDeliveryRate.rate', id: 'AH-52', valueField: 'rate', numeratorField: 'unitOnTimeDeliveryCount', denominatorField: 'totalUnitCount', rate: true },
  { metric: 'Invoice defect rate', category: 'invoiceDefectRate', field: 'invoiceDefectRate.rate', id: 'AH-15', valueField: 'rate', numeratorField: 'invoiceDefect.count', denominatorField: 'orderCount', rate: true },
];

const display = (value: unknown) => value == null ? 'Not returned by Amazon' : String(value);
const raw = (value: unknown) => value != null && typeof value === 'object' ? value as Record<string, unknown> : {};
const pathValue = (value: unknown, path: string) => path.split('.').reduce<unknown>((current, key) => raw(current)[key], value);
const asReportMetrics = (report?: Report | null) => report?.performanceMetrics.find(entry => entry.marketplaceId === report.marketplaceId)?.metrics ?? [];
const findValue = (metrics: Metric[], category: string): HealthValue | undefined => {
  const value = metrics.find(metric => metric.category === category)?.value;
  return Array.isArray(value) ? value[0] : value;
};
const rateText = (value: unknown) => typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : 'Not returned by Amazon';
const sheetDate = (value?: string) => {
  if (!value) return 'Not returned by Amazon';
  const match = value.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(match[2]) - 1];
  return `${match[3]}-${month}-${match[1].slice(-2)}`;
};
const statusLabel = (value?: string) => value || 'Not returned by Amazon';
const targetLabel = (value?: HealthValue, rate = false) => {
  if (typeof value?.targetValue !== 'number') return 'Not returned by Amazon';
  const condition = value.targetCondition === 'LESS_THAN' ? 'Under' : value.targetCondition === 'GREATER_THAN' ? 'Over' : value.targetCondition === 'EQUALS' ? 'Equals' : value.targetCondition || '';
  const threshold = rate ? rateText(value.targetValue) : value.targetValue;
  return `${condition} ${threshold}`;
};

function baseRow(input: {
  metric: string; field: string; id: string; subMetric?: string; value?: unknown; target?: string;
  numerator?: unknown; denominator?: unknown; rate?: boolean; status?: string; range?: HealthValue['reportingDateRange']; noReportingWindow?: boolean;
}): DetailRow {
  const { metric, field, id, subMetric = '', value, target, numerator, denominator, rate = false, status, range, noReportingWindow = false } = input;
  return {
    metric, subMetric, target: target || 'Not returned by Amazon', current: rate ? rateText(value) : display(value),
    status: statusLabel(status),
    numerator: numerator == null ? '' : String(numerator), denominator: denominator == null ? '' : String(denominator),
    from: noReportingWindow ? '—' : sheetDate(range?.reportingDateFrom), to: noReportingWindow ? '—' : sheetDate(range?.reportingDateTo),
    sourceField: field, metricId: id,
  };
}

function headroom(value?: HealthValue, numerator?: unknown, denominator?: unknown) {
  if (!value || typeof numerator !== 'number' || typeof denominator !== 'number' || denominator <= 0 || typeof value.targetValue !== 'number') return 'Not available';
  if (value.targetCondition === 'LESS_THAN') return String(Math.max(0, Math.ceil(value.targetValue * denominator) - 1 - numerator));
  if (value.targetCondition === 'GREATER_THAN') return String(Math.max(0, numerator - Math.floor(value.targetValue * denominator) - 1));
  return '—';
}

function buildSections(report: Report): Section[] {
  const metrics = asReportMetrics(report);
  const rating = findValue(metrics, 'accountHealthRating');
  const accountStatus = report.accountStatuses.find(status => status.marketplaceId === report.marketplaceId)?.status;
  const accountRows = [
    baseRow({ metric: 'Account status', field: 'accountStatuses[].status', id: 'AH-04', value: accountStatus, status: accountStatus, noReportingWindow: true }),
    baseRow({ metric: 'Account Health Rating score', field: 'accountHealthRating.ahrScore', id: 'AH-01', value: rating?.ahrScore, status: rating?.ahrStatus, target: targetLabel(rating), range: rating?.reportingDateRange }),
    baseRow({ metric: 'Account Health Rating status', field: 'accountHealthRating.ahrStatus', id: 'AH-02', value: rating?.ahrStatus, status: rating?.ahrStatus, range: rating?.reportingDateRange }),
  ];
  const odr = findValue(metrics, 'orderDefectRate');
  const odrRows: DetailRow[] = [];
  for (const channel of ['afn', 'mfn'] as const) {
    const sub = odr?.[channel];
    const label = channel === 'afn' ? 'FBA' : 'FBM';
    const suffix = channel === 'afn' ? 'AFN' : 'MFN';
    odrRows.push(baseRow({ metric: 'Order defect rate', subMetric: label, field: `orderDefectRate.${channel}.rate`, id: `AH-08-${suffix}`, value: sub?.rate, target: targetLabel(sub, true), numerator: sub?.orderWithDefects?.count, denominator: sub?.orderCount, status: sub?.status, range: sub?.reportingDateRange, rate: true }));
  }
  for (const component of ODR_COMPONENTS) {
    for (const channel of ['afn', 'mfn'] as const) {
      const sub = odr?.[channel];
      const label = channel === 'afn' ? 'FBA' : 'FBM';
      const suffix = channel === 'afn' ? 'AFN' : 'MFN';
      const componentValue = sub?.[component.valueField];
      odrRows.push(baseRow({ metric: component.name, subMetric: label, field: `orderDefectRate.${channel}.${component.field}`, id: `${component.base}-${suffix}`, value: componentValue?.count, status: componentValue?.status, range: sub?.reportingDateRange }));
    }
  }
  const shippingRows = RATE_SPECS.map(spec => {
    const value = findValue(metrics, spec.category);
    return baseRow({ metric: spec.metric, field: spec.field, id: spec.id, value: value?.[spec.valueField || 'rate'], target: targetLabel(value, spec.rate), numerator: pathValue(value, spec.numeratorField || ''), denominator: pathValue(value, spec.denominatorField || ''), status: value?.status, range: value?.reportingDateRange, rate: spec.rate });
  });
  const policyRows = POLICY_FIELDS.map(([label, category, id]) => {
    const value = findValue(metrics, category);
    return baseRow({ metric: label, field: `${category}.defectsCount`, id, value: value?.defectsCount, target: targetLabel(value), status: value?.status, range: value?.reportingDateRange });
  });
  const warnings = findValue(metrics, 'policyViolationWarnings');
  policyRows.push(baseRow({ metric: 'Policy violation warnings', field: 'policyViolationWarnings.warningsCount', id: 'AH-54', value: warnings?.warningsCount, range: warnings?.reportingDateRange }));
  const lateWindows = metrics.find(metric => metric.category === 'lateShipmentRateList')?.value;
  if (Array.isArray(lateWindows)) {
    for (const value of lateWindows) shippingRows.push(baseRow({ metric: 'Late shipment rate — reporting window', field: 'lateShipmentRate.rate', id: 'AH-16-window', value: value.rate, target: targetLabel(value, true), numerator: value.lateShipmentCount, denominator: value.orderCount, status: value.status, range: value.reportingDateRange, rate: true }));
  }
  for (const row of [...odrRows, ...shippingRows]) {
    const spec = RATE_SPECS.find(item => item.field === row.sourceField);
    const value = row.sourceField.startsWith('orderDefectRate.') ? odr?.[row.subMetric === 'FBA' ? 'afn' : 'mfn'] : row.metricId === 'AH-16-window' && Array.isArray(lateWindows) ? lateWindows.find(item => sheetDate(item.reportingDateRange?.reportingDateFrom) === row.from && sheetDate(item.reportingDateRange?.reportingDateTo) === row.to) : findValue(metrics, spec?.category || '');
    row.headroom = row.sourceField.endsWith('.rate') ? headroom(value, row.numerator === '' ? undefined : Number(row.numerator), row.denominator === '' ? undefined : Number(row.denominator)) : '—';
  }
  return [
    { title: '1. Account status and rating', rows: accountRows },
    { title: '2. Order defect rate (ODR)', rows: odrRows },
    { title: '3. Shipping and invoice performance', rows: shippingRows },
    { title: '4. Policy compliance (violations in the window)', rows: policyRows },
  ];
}

function accountHealthClaims(report: Report, claimData: ClaimData | null) {
  const events = claimData?.events ?? [];
  const usableAmounts = events.filter(event => typeof event.amount === 'number' && event.currency === 'USD');
  const allAmountsReturned = events.length === usableAmounts.length;
  const amountTotal = claimData?.available && !claimData.truncated && !claimData.pending && allAmountsReturned ? usableAmounts.reduce((total, event) => total + (event.amount ?? 0), 0) : null;
  return {
    count: claimData?.available && (!claimData.pending && !claimData.truncated || events.length > 0) ? events.length : null,
    asOf: claimData?.capturedAt || report.capturedAt,
    amountTotal,
    events,
    available: Boolean(claimData?.available),
    loading: claimData === null || Boolean(claimData.pending && !events.length),
    reason: claimData?.reason,
    truncated: claimData?.truncated,
    noClaimsInWindow: Boolean(claimData?.noClaimsInWindow),
    sourceField: claimData?.source || 'Finances API · FinancialEvents.GuaranteeClaimEventList',
    countSource: 'orderDefectRate.afn.claims.count + orderDefectRate.mfn.claims.count',
  };
}

const columns: [keyof DetailRow, string][] = [
  ['metric', 'Metric'], ['subMetric', 'Sub Metric'], ['target', 'Target'], ['current', 'Current'],
  ['status', 'Status'],
  ['numerator', 'Affected / qualifying count'], ['denominator', 'Total orders / shipments / units'],
  ['headroom', 'Headroom (fixed volume)'],
];

type OrderDetail = { orderId?: string; orderDate?: string; sku?: string; title?: string; fulfillmentChannel?: string; status?: string; shipServiceLevel?: string; shipState?: string; latestShipDate?: string; earliestDeliveryDate?: string; latestDeliveryDate?: string };
const subscribeLocation = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); };
function TableRows({ count, children }: { count: number; children: (start: number, end: number) => ReactNode }) {
  const [pageSize, setPageSize] = useState(25);
  const [requestedPage, setPage] = useState(1);
  const paginated = count > 25;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const page = Math.min(requestedPage, pages);
  const start = paginated ? (page - 1) * pageSize : 0;
  const end = paginated ? Math.min(start + pageSize, count) : count;
  return <div className="health-details-table-block">{children(start, end)}{paginated && <nav className="account-health-pagination" aria-label="Table pagination">
    <label>Rows per page <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    <div><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span aria-live="polite">Page {page} of {pages}</span><button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button></div>
  </nav>}</div>;
}
function DetailTable({ headings, rows, empty }: { headings: string[]; rows: string[][]; empty: string }) {
  return <TableRows count={rows.length}>{(start, end) => <div className="account-health-table-wrap"><table className="account-health-table account-health-sheet-table"><thead><tr>{headings.map(heading => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.length ? rows.slice(start, end).map((row, index) => <tr key={start + index}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>) : <tr><td colSpan={headings.length}>{empty}</td></tr>}</tbody></table></div>}</TableRows>;
}
function MetricDetails({ report, selectedField, startDate, endDate, claimEvents }: { report: Report; selectedField: string; startDate: string; endDate: string; claimEvents: ClaimEvent[] }) {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [trend, setTrend] = useState<{ capturedAt: string; rating?: HealthValue }[]>([]);
  const [catalog, setCatalog] = useState<{ sku: string; asin: string; title: string; status?: string | string[] }[]>([]);
  const [changes, setChanges] = useState<{ sku?: string; asin?: string; field?: string; previous?: unknown; current?: unknown; detectedAt?: string }[]>([]);
  const [contextNote, setContextNote] = useState('Loading listing context…');
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/amazon/monitor', { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw Error(body.error || 'Listing context unavailable.');
        setCatalog(body.run?.products || []); setChanges(body.changes || []);
        setContextNote(body.run ? `Listing snapshot: ${sheetDate(body.run.capturedAt)}. Changes are possible context, not confirmed causes.` : 'No saved listing snapshot available.');
      } catch (error) { if (!controller.signal.aborted) setContextNote(error instanceof Error ? error.message : 'Listing context unavailable.'); }
    };
    if (!selectedField || POLICY_FIELDS.some(([, category]) => selectedField.startsWith(category))) void load();
    return () => controller.abort();
  }, [selectedField]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/amazon/account-health?${new URLSearchParams({ view: 'trend', startDate, endDate })}`, { signal: controller.signal, cache: 'no-store' }).then(async response => response.ok ? response.json() : null).then(body => { if (body) setTrend(body.snapshots || []); }).catch(() => {});
    return () => controller.abort();
  }, [startDate, endDate]);
  const [orderNote, setOrderNote] = useState('Loading related orders…');
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [orderReload, setOrderReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const channel = /^(lateShipmentRate|preFulfillmentCancellationRate|validTrackingRate|onTimeDeliveryRate|unitOnTimeDeliveryRate)/.test(selectedField) ? 'fbm' : '';
    fetch(`/api/amazon/account-health/orders?${new URLSearchParams({ startDate, endDate, channel })}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: 'no-store' }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw Error(body.error || 'Related orders could not be loaded.');
      setOrders(body.orderRecords || []);
      setOrderNote(body.available ? `${body.source} · Last pulled ${sheetDate(body.capturedAt)} · ${body.total.toLocaleString()} order-item rows in selected dates. Related context, not a confirmed defect list.` : 'No saved Amazon order report. Pull the latest data from the Account Health dashboard.');
      if (body.pullFailed) setOrderNote('The latest Amazon order pull failed. Saved report rows are shown; pull the latest data from the Account Health dashboard to retry.');
      if (body.running) timer = setTimeout(() => setOrderReload(value => value + 1), 8000);
    }).catch(error => { if (!controller.signal.aborted) { setOrderNote(error.name === 'TimeoutError' ? 'Amazon orders took too long to load. Refresh the page to retry.' : error.message); } }).finally(() => { if (!controller.signal.aborted) setOrdersLoaded(true); });
    return () => { controller.abort(); clearTimeout(timer); };
  }, [startDate, endDate, orderReload, selectedField]);
  const metrics = asReportMetrics(report);
  const odr = findValue(metrics, 'orderDefectRate');
  const show = (field: string) => !selectedField || selectedField.startsWith(field) || selectedField === 'orderDefectRate.rate' && field.startsWith('orderDefectRate.');
  const fbm = orders.filter(order => /^(merchant|mfn|fbm)$/i.test(order.fulfillmentChannel || ''));
  const section = (title: string, content: React.ReactNode) => <section className="account-health-detail-section account-health-sheet-section"><h2>{title}</h2>{content}</section>;
  const orderRows = (rows: OrderDetail[]) => rows.map(order => [order.orderId || 'Not returned', order.sku || 'Not returned', order.title || 'Not returned', order.orderDate || 'Not returned', order.status || 'Not returned', order.shipServiceLevel || 'Not returned', order.shipState || 'Not returned']);
  const orderTable = (rows: OrderDetail[]) => <><p className="account-health-note">{orderNote}</p><DetailTable headings={['Order ID', 'SKU', 'Product', 'Order date', 'Status', 'Ship service level', 'Ship-to state']} rows={orderRows(rows)} empty={ordersLoaded ? 'No matching FBM order rows in the selected dates. Try a broader date range or pull latest orders.' : 'Loading Amazon order report…'} /></>;
  const cancellations = fbm.filter(order => /cancel/i.test(order.status || ''));
  const groups = (key: 'sku' | 'orderDate') => {
    const result = new Map<string, Set<string>>();
    for (const order of cancellations) { const label = order[key] || 'Not returned'; const group = result.get(label) || new Set<string>(); if (order.orderId) group.add(order.orderId); result.set(label, group); }
    return Array.from(result, ([label, ids]) => [label, String(ids.size)]);
  };
  return <>
    {show('accountHealthRating') && section('Rating overview and metrics needing attention', <>
      <p>Reported metric rows on target: {buildSections(report).flatMap(section => section.rows).filter(row => ['GOOD', 'GREAT'].includes(row.status)).length}</p>
      <DetailTable headings={['Metric', 'Channel', 'Current value', 'Target', 'Status']} rows={buildSections(report).flatMap(section => section.rows).map(row => [row.metric, row.subMetric || '—', row.current, row.target, row.status])} empty="No reported metrics." />
      <DetailTable headings={['Metric needing attention', 'Count / value', 'Status']} rows={metrics.filter(metric => !Array.isArray(metric.value) && metric.value.status === 'BAD').map(metric => [metric.category.replace(/([a-z])([A-Z])/g, '$1 $2'), display((metric.value as HealthValue).defectsCount ?? (metric.value as HealthValue).rate), 'BAD'])} empty="No metrics marked BAD in this snapshot." />
      <p>Amazon does not return each issue’s score impact. Score trends require saved historical snapshots.</p>
      <DetailTable headings={['Snapshot date', 'AHR score', 'AHR status']} rows={trend.map(snapshot => [sheetDate(snapshot.capturedAt), display(snapshot.rating?.ahrScore), display(snapshot.rating?.ahrStatus)])} empty="No historical snapshots available in the selected dates." />
    </>)}
    {show('orderDefectRate.claims') && section('Claims — related order and product details', <><p>{orderNote}</p><DetailTable headings={['Order ID', 'SKU', 'Product', 'Channel']} rows={claimEvents.flatMap(event => { const related = orders.filter(order => order.orderId === event.orderId); return related.length ? related.map(order => [event.orderId || 'Not returned', order.sku || 'Not returned', order.title || 'Not returned', order.fulfillmentChannel || 'Not returned']) : [[event.orderId || 'Not returned', 'No matching order in selected dates', 'Not available', 'Not available']]; })} empty="No returned claim events to match to orders." /><p>Reason, claim status, reply-by date, decision and comments are not returned by Amazon.</p><a href="https://sellercentral.amazon.com/performance/dashboard" target="_blank" rel="noreferrer">Open claims in Seller Central</a></>)}
    {show('orderDefectRate.rate') && section('Defect type split — reported component counts', <>
      <DetailTable headings={['Defect type', 'FBA', 'FBM']} rows={ODR_COMPONENTS.map(component => [component.name, display(odr?.afn?.[component.valueField]?.count), display(odr?.mfn?.[component.valueField]?.count)])} empty="No component data returned." />
      {ODR_COMPONENTS.map(component => { const a = odr?.afn?.[component.valueField]?.count; const b = odr?.mfn?.[component.valueField]?.count; const count = typeof a === 'number' && typeof b === 'number' ? a + b : null; return <p key={component.name}>{component.name}: {count ?? 'Not returned'} {count != null && <meter min={0} max={Math.max(1, ...ODR_COMPONENTS.map(item => (odr?.afn?.[item.valueField]?.count || 0) + (odr?.mfn?.[item.valueField]?.count || 0)))} value={count} aria-label={component.name} />}</p>; })}
      <p>Component counts may overlap. Amazon does not return a confirmed defective-order list. An estimated list needs claims, chargeback and feedback sources; missing sources cannot be treated as zero defects.</p>
    </>)}
    {show('orderDefectRate.chargebacks') && section('Chargeback events', <><DetailTable headings={['Order ID', 'Amount', 'Currency', 'Date posted', 'SKU', 'Product', 'Channel']} rows={[]} empty="Chargeback event details are not available from the connected source. The reported FBA / FBM counts are shown above." /><p>Reason and dispute deadline are not returned by Amazon.</p><a href="https://sellercentral.amazon.com/performance/dashboard" target="_blank" rel="noreferrer">Open Seller Central</a></>)}
    {show('orderDefectRate.negativeFeedback') && section('Negative and neutral feedback', <><DetailTable headings={['Date', 'Rating', 'Comment', 'Response', 'Order ID', 'SKU', 'Product']} rows={[]} empty="Feedback report rows are not available from the connected source. Amazon does not return the overall feedback score or positive counts through this Account Health report." /><a href="https://sellercentral.amazon.com/performance/dashboard" target="_blank" rel="noreferrer">Open Seller Central</a></>)}
    {show('lateShipmentRate') && section('FBM shipment context and open orders', <>{orderTable(fbm)}</>)}
    {show('preFulfillmentCancellationRate') && section('Cancelled FBM orders — includes buyer cancellations', <>{orderTable(cancellations)}<DetailTable headings={['SKU', 'Distinct cancelled orders']} rows={groups('sku')} empty="No cancelled FBM orders available." /><DetailTable headings={['Day', 'Distinct cancelled orders']} rows={groups('orderDate')} empty="No cancelled FBM orders available." /><p>Who cancelled and why are not returned. These rows may differ from Amazon’s pre-fulfillment cancellation count.</p></>)}
    {show('validTrackingRate') && section('FBM order volume and shipped-order mix', <><DetailTable headings={['Order status', 'Distinct orders']} rows={Array.from(new Set(fbm.map(order => order.status || 'Not returned'))).map(status => [status, String(new Set(fbm.filter(order => (order.status || 'Not returned') === status).map(order => order.orderId).filter(Boolean)).size)])} empty={orderNote} />{orderTable(fbm)}<p>Invalid-tracking shipment IDs, tracking numbers and carriers are not returned by this source.</p></>)}
    {(show('onTimeDeliveryRate') || show('unitOnTimeDeliveryRate')) && section('Delivery context — rough indicator', <>{orderTable(fbm.filter(order => /delivered|out for delivery|return/i.test(order.status || '')))}<p>Promised delivery dates are promises, not actual delivery dates. This is not a confirmed list of late deliveries.</p></>)}
    {(!selectedField || POLICY_FIELDS.some(([, category]) => selectedField.startsWith(category))) && section('Policy violation details', <><p>Total reported violations: {POLICY_FIELDS.every(([, category]) => typeof findValue(metrics, category)?.defectsCount === 'number') ? POLICY_FIELDS.reduce((sum, [, category]) => sum + (findValue(metrics, category)?.defectsCount || 0), 0) : 'Not available — incomplete counts'}</p><DetailTable headings={['SKU / listing', 'Violation type', 'Issue code', 'Issue message', 'Violation date', 'Amazon action']} rows={[]} empty="Listing-level violation issues are not available from this Account Health source." /><p>{contextNote}</p><DetailTable headings={['Listing status', 'Listings']} rows={Array.from(new Set(catalog.map(product => Array.isArray(product.status) ? product.status.join(', ') : product.status || 'Not returned'))).map(status => [status, String(catalog.filter(product => (Array.isArray(product.status) ? product.status.join(', ') : product.status || 'Not returned') === status).length)])} empty="Listing status counts unavailable." /><DetailTable headings={['Detected at', 'SKU', 'ASIN', 'Changed field', 'Previous', 'Current']} rows={changes.filter(change => (!startDate || (change.detectedAt || '').slice(0, 10) >= startDate) && (!endDate || (change.detectedAt || '').slice(0, 10) <= endDate)).map(change => [sheetDate(change.detectedAt), change.sku || 'Not returned', change.asin || 'Not returned', change.field || 'Not returned', typeof change.previous === 'object' ? JSON.stringify(change.previous) : display(change.previous), typeof change.current === 'object' ? JSON.stringify(change.current) : display(change.current)])} empty="No recent listing changes available in the selected dates." /><a href="https://sellercentral.amazon.com/performance/dashboard" target="_blank" rel="noreferrer">Open policy details in Seller Central</a></>)}
    {show('policyViolationWarnings') && section('Warning details', <DetailTable headings={['Warning', 'Date', 'Status', 'Reporting window']} rows={[]} empty="Warning details are not returned by Amazon for this account. An empty detail list does not establish that all warnings have been resolved." />)}
    {show('invoiceDefectRate') && section('Invoice defects', <><DetailTable headings={['Missing invoices', 'Late invoices', 'Invoice-eligible orders']} rows={[[display(pathValue(findValue(metrics, 'invoiceDefectRate'), 'missingInvoice.count')), display(pathValue(findValue(metrics, 'invoiceDefectRate'), 'lateInvoice.count')), display(findValue(metrics, 'invoiceDefectRate')?.orderCount)]]} empty="Not returned by Amazon" />{findValue(metrics, 'invoiceDefectRate')?.orderCount === 0 && <p>No invoice-eligible orders.</p>}<p>Order-level invoice defects are not returned by Amazon.</p></>)}
  </>;
}

export default function AmazonAccountHealthDetails() {
  const { startDate, endDate } = useGlobalDateRange();
  const [report, setReport] = useState<Report | null>(null);
  const [availableRange, setAvailableRange] = useState({ startDate: '', endDate: '' });
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [claimData, setClaimData] = useState<ClaimData | null>(null);
  const locationSearch = useSyncExternalStore(subscribeLocation, () => window.location.search, () => '');
  const selectedField = new URLSearchParams(locationSearch).get('field') || '';
  useEffect(() => {
    let active = true;
    let claimsTimer: ReturnType<typeof setTimeout>;
    const query = new URLSearchParams({ startDate, endDate });
    fetch(`/api/amazon/account-health?${query}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error || 'Account Health data request failed.');
        if (active) {
          setReport(body.data as Report | null);
          if (body.availableRange) setAvailableRange(body.availableRange);
        }
      })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Account Health unavailable.'); })
      .finally(() => { if (active) setLoaded(true); });
    const loadClaims = () => fetch('/api/amazon/account-health/claims', { cache: 'no-store', signal: AbortSignal.timeout(20000) })
      .then(async response => await response.json() as ClaimData)
      .then(claims => {
        if (!active) return;
        setClaimData(claims);
        if (claims.pending) claimsTimer = setTimeout(() => { void loadClaims(); }, 5000);
      })
      .catch(() => { if (active) setClaimData({ available: false, events: [], reason: 'Amazon claim financial events could not be loaded. Check Finance and Accounting SP-API access and try again.' }); });
    void loadClaims();
    return () => { active = false; clearTimeout(claimsTimer); };
  }, [startDate, endDate]);

  const allSections = report ? buildSections(report) : [];
  const isSelected = (field: string) => !selectedField || field.replace(/\.(afn|mfn)\./, '.') === selectedField || (selectedField.startsWith('accountHealthRating.') && (field.startsWith('accountHealthRating.') || field.startsWith('accountStatuses'))) || (selectedField === 'orderDefectRate.rate' && field.startsWith('orderDefectRate.')) || (selectedField.includes('onTimeDeliveryRate') && /[Oo]nTimeDeliveryRate/.test(field));
  const sections = allSections.map(section => ({ ...section, rows: section.rows.filter(row => isSelected(row.sourceField)) })).filter(section => section.rows.length);
  const defaultDateRange = claimData?.reportingRange || availableRange;
  const effectiveStartDate = startDate || defaultDateRange.startDate;
  const effectiveEndDate = endDate || defaultDateRange.endDate;
  const claimsPeriod = effectiveStartDate && effectiveEndDate ? `${sheetDate(effectiveStartDate)} – ${sheetDate(effectiveEndDate)}` : 'Date range unavailable';
  const filteredClaims = claimData ? { ...claimData, events: claimData.events.filter(event => {
    const date = event.dateFiled?.slice(0, 10);
    return (!effectiveStartDate && !effectiveEndDate) || Boolean(date && (!effectiveStartDate || date >= effectiveStartDate) && (!effectiveEndDate || date <= effectiveEndDate));
  }) } : null;
  const claims = report ? accountHealthClaims(report, filteredClaims) : null;
  const rating = report ? findValue(asReportMetrics(report), 'accountHealthRating') : undefined;
  const metricRows = allSections.flatMap(section => section.rows);
  const attentionCount = metricRows.filter(row => row.status === 'BAD').length;
  const pageTitle = selectedField.startsWith('accountHealthRating.') ? 'Account Health Rating' : selectedField ? sections.flatMap(section => section.rows)[0]?.metric || 'Account Health Details' : 'Account Health Overview';

  return <main className="account-health-details account-health-sheet-view health-details-redesign">
    <div className="account-health-details-toolbar">
      <button className="account-health-back" type="button" onClick={() => { window.location.href = '/?page=accountHealth'; }}>← Back to Account Health</button>
      <GlobalDateRangeFilter showProducts={false} defaultRange={defaultDateRange} />
    </div>
    <header className="health-details-heading"><h1>{pageTitle}</h1></header>
    {error && <p role="alert" className="account-health-detail-error">{error}</p>}
    {!loaded && !error && <p>Loading Account Health details…</p>}
    {loaded && !report && !error && <p>{startDate || endDate ? 'No saved Account Health snapshot is available in the selected date range. Choose another range or clear the filter.' : 'No saved Amazon Account Health report is available yet. Pull the latest report from the Account Health page.'}</p>}
    {report && <>
      <div className="health-details-snapshot"><span className="health-details-dot" />Latest displayed snapshot <strong>{sheetDate(report.capturedAt)}</strong></div>
      {(!selectedField || selectedField.startsWith('accountHealthRating.')) && <div className="health-details-stats">
        <div><span>Account Health Rating</span><strong>{rating?.ahrScore ?? '—'}</strong><AccountHealthStatus status={rating?.ahrStatus || 'Not returned'} /></div>
        <div><span>Metrics on target</span><strong>{metricRows.filter(row => ['GOOD', 'GREAT'].includes(row.status)).length}</strong><small>Reported metric rows</small></div>
        <div><span>Needs attention</span><strong>{attentionCount}</strong><small>{attentionCount ? 'Review the flagged metrics below' : 'No metrics marked BAD'}</small></div>
      </div>}
      {sections.map(section => {
        const sectionColumns = columns.filter(([key]) => {
          if (section.title === '1. Account status and rating') return !['subMetric', 'numerator', 'denominator', 'headroom'].includes(key);
          if (section.title === '3. Shipping and invoice performance' || section.title === '4. Policy compliance (violations in the window)') return key !== 'subMetric';
          return true;
        });
        return <section className="account-health-detail-section account-health-sheet-section" key={section.title}>
        <h2>{section.title.replace(/^\d+\.\s*/, '')}</h2>
        <TableRows key={`${section.title}:${startDate}:${endDate}:${selectedField}`} count={section.rows.length}>{(start, end) => <div className="account-health-table-wrap"><table className="account-health-table account-health-sheet-table"><thead><tr>{sectionColumns.map(([, heading]) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{section.rows.slice(start, end).map((row, rowIndex) => <tr data-health-field={row.sourceField} tabIndex={-1} key={`${row.metric}-${row.subMetric}-${rowIndex}`}>{sectionColumns.map(([key]) => <td key={key} className={key === 'sourceField' ? 'account-health-source-field' : ''}>{key === 'status' ? <AccountHealthStatus status={row.status} /> : display(row[key])}</td>)}</tr>)}</tbody></table></div>}</TableRows>
      </section>; })}
      <MetricDetails key={`${effectiveStartDate}:${effectiveEndDate}`} report={report} selectedField={selectedField} startDate={effectiveStartDate} endDate={effectiveEndDate} claimEvents={filteredClaims?.events || []} />
      {claims && (!selectedField || selectedField === 'orderDefectRate.claims.count' || selectedField === 'orderDefectRate.rate') && <section className="account-health-detail-section account-health-sheet-section account-health-claims-sheet">
        <h2>A-to-z Guarantee Claims</h2>
        {claimData?.pending && <p role="status" className="account-health-note">Pulling latest claims from Amazon{claimData.pagesLoaded ? ` · ${claimData.pagesLoaded} pages checked` : ''}. Results update automatically.</p>}
        <div className="account-health-claims-summary">
          <div><b>As of date</b><strong>{sheetDate(claims.asOf)}</strong></div>
          <div><b>Claims in the table{claims.truncated ? " (partial)" : ""}</b><strong>{claims.count == null ? 'Not returned by Amazon' : claims.count}</strong><small>{claims.available ? claims.sourceField : claims.loading ? 'Amazon claim events are loading; pull is incomplete' : 'No complete claim-event result available'}</small></div>
          <div><b>Total from returned claim events (USD){claims.truncated ? " (partial)" : ""}</b><strong>{claims.loading ? 'Loading…' : claims.amountTotal == null ? 'Not available' : claims.amountTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</strong><small>{claims.available ? 'Calculated from Amazon claim-event charge adjustments' : claims.loading ? 'Waiting for Amazon Financial Events' : 'Unavailable until Amazon Finance API access is granted'}</small></div>
        </div>
        <h3>Fields available on the Amazon A-to-z Claims page</h3>
        <p className="account-health-note">Claims date range: <strong>{claimsPeriod}</strong>{claimData?.reportingRange && <> · Amazon data checked: {sheetDate(claimData.reportingRange.startDate)} – {sheetDate(claimData.reportingRange.endDate)}</>}</p>
        <TableRows key={`${effectiveStartDate}:${effectiveEndDate}`} count={claims.available ? claims.events.length : 0}>{(start, end) => <div className="account-health-table-wrap"><table className="account-health-table account-health-sheet-table account-health-claims-table"><thead><tr><th>Date filed / posted</th><th>Order ID</th><th>Claim amount (USD)</th></tr></thead><tbody>{claims.available && claims.events.length ? claims.events.slice(start, end).map((event, index) => <tr key={`${event.orderId}-${event.dateFiled}-${index}`}><td>{event.dateFiled ? sheetDate(event.dateFiled) : 'Not returned by Amazon'}</td><td>{event.orderId || 'Not returned by Amazon'}</td><td>{event.amount != null && event.currency === 'USD' ? event.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Not returned'}</td></tr>) : <tr><td colSpan={3}>{claims.loading ? 'Loading A-to-z claim events from Amazon Finances API…' : claims.noClaimsInWindow ? 'Amazon Account Health reports 0 A-to-z claims in this reporting window, so there are no claim rows to list.' : claims.truncated ? 'No claims found in the pages checked so far. Full Amazon history is still being retrieved.' : claims.available ? `No A-to-z claim financial events found for ${claimsPeriod}.` : claims.reason || 'Amazon Finance API claim events are unavailable. No complete claim-event result is available.'}</td></tr>}</tbody><tfoot><tr><td colSpan={2}>Total from returned claim events (USD){claims.truncated ? " (partial)" : ""}</td><td>{claims.loading ? "Loading…" : claims.amountTotal == null ? "Not available" : claims.amountTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr></tfoot></table></div>}</TableRows>
        {claims.truncated && <p className="account-health-claims-source">Amazon returned more events than this pull could retrieve; the exported list may be incomplete.</p>}
      </section>}
    </>}
  </main>;
}
