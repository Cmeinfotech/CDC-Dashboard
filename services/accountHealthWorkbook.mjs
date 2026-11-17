import * as XLSX from 'xlsx';

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
];
const RATE_SPECS = [
  ['Late shipment rate', 'lateShipmentRate', 'lateShipmentRate.rate', 'AH-16', 'lateShipmentCount', 'orderCount'],
  ['Pre-fulfillment cancellation rate', 'preFulfillmentCancellationRate', 'preFulfillmentCancellationRate.rate', 'AH-17', 'cancellationCount', 'orderCount'],
  ['Valid tracking rate', 'validTrackingRate', 'validTrackingRate.rate', 'AH-18', 'validTrackingCount', 'shipmentCount'],
  ['On-time delivery rate — shipments', 'onTimeDeliveryRate', 'onTimeDeliveryRate.rate', 'AH-19', 'onTimeDeliveryCount', 'shipmentCountWithValidTracking'],
  ['Unit on-time delivery rate', 'unitOnTimeDeliveryRate', 'unitOnTimeDeliveryRate.rate', 'AH-52', 'unitOnTimeDeliveryCount', 'totalUnitCount'],
  ['Invoice defect rate', 'invoiceDefectRate', 'invoiceDefectRate.rate', 'AH-15', 'invoiceDefect.count', 'orderCount'],
];
const raw = value => value && typeof value === 'object' ? value : {};
const findValue = (metrics, category) => {
  const value = metrics.find(item => item.category === category)?.value;
  return Array.isArray(value) ? value[0] : value;
};
const nested = (value, path) => path.split('.').reduce((current, key) => raw(current)[key], value);
const excelDate = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : 'n/a';
const rateText = value => typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : 'Not returned';
const targetText = (value, rate = false) => {
  if (typeof value?.targetValue !== 'number') return 'Not returned';
  const op = value.targetCondition === 'LESS_THAN' ? 'Under' : value.targetCondition === 'GREATER_THAN' ? 'Over' : value.targetCondition === 'EQUALS' ? 'Equals' : value.targetCondition || '';
  return `${op} ${rate ? rateText(value.targetValue) : value.targetValue}`;
};
const statusText = value => value || 'Not returned by Amazon';

function buildDetailRows(data) {
  const metrics = data.performanceMetrics.find(item => item.marketplaceId === data.marketplaceId)?.metrics ?? [];
  const rating = findValue(metrics, 'accountHealthRating');
  const accountStatus = data.accountStatuses?.find(item => item.marketplaceId === data.marketplaceId)?.status;
  const rows = [];
  const push = (spec) => rows.push({
    metric: spec.metric, subMetric: spec.subMetric ?? '', target: spec.target ?? 'Not returned', current: spec.current ?? 'Not returned',
    status: statusText(spec.status), numerator: spec.numerator ?? '', denominator: spec.denominator ?? '',
    from: spec.noReportingWindow ? '—' : excelDate(spec.range?.reportingDateFrom), to: spec.noReportingWindow ? '—' : excelDate(spec.range?.reportingDateTo), sourceField: spec.field, metricId: spec.id,
    rawValue: spec.rawValue ?? '', targetValue: spec.targetValue ?? '', targetCondition: spec.targetCondition ?? '', rate: Boolean(spec.rate),
  });
  push({ metric: 'Account status', field: 'accountStatuses[].status', id: 'AH-04', current: accountStatus, status: accountStatus, noReportingWindow: true });
  push({ metric: 'Account Health Rating score', field: 'accountHealthRating.ahrScore', id: 'AH-01', current: rating?.ahrScore, rawValue: rating?.ahrScore, range: rating?.reportingDateRange });
  push({ metric: 'Account Health Rating status', field: 'accountHealthRating.ahrStatus', id: 'AH-02', current: rating?.ahrStatus, rawValue: rating?.ahrStatus, range: rating?.reportingDateRange });
  const odr = findValue(metrics, 'orderDefectRate');
  for (const channel of ['afn', 'mfn']) {
    const value = odr?.[channel];
    const label = channel === 'afn' ? 'FBA' : 'FBM';
    const suffix = channel === 'afn' ? 'AFN' : 'MFN';
    push({ metric: 'Order defect rate', subMetric: label, field: `orderDefectRate.${channel}.rate`, id: `AH-08-${suffix}`, current: value?.rate, rawValue: value?.rate, target: targetText(value, true), targetValue: value?.targetValue, targetCondition: value?.targetCondition, status: value?.status, numerator: value?.orderWithDefects?.count, denominator: value?.orderCount, range: value?.reportingDateRange, rate: true });
    for (const [name, key, id] of [['A-to-z claims', 'claims', 'AH-09-CLM'], ['Chargebacks', 'chargebacks', 'AH-09-CB'], ['Negative feedback', 'negativeFeedback', 'AH-09-NF']]) {
      push({ metric: name, subMetric: label, field: `orderDefectRate.${channel}.${key}.count`, id: `${id}-${suffix}`, current: value?.[key]?.count, rawValue: value?.[key]?.count, status: value?.[key]?.status, range: value?.reportingDateRange });
    }
  }
  for (const [name, category, field, id, numerator, denominator] of RATE_SPECS) {
    const value = findValue(metrics, category);
    push({ metric: name, field, id, current: value?.rate, rawValue: value?.rate, target: targetText(value, true), targetValue: value?.targetValue, targetCondition: value?.targetCondition, status: value?.status, numerator: nested(value, numerator), denominator: nested(value, denominator), range: value?.reportingDateRange, rate: true });
  }
  for (const [name, category, id] of POLICY_FIELDS) {
    const value = findValue(metrics, category);
    push({ metric: name, field: `${category}.defectsCount`, id, current: value?.defectsCount, rawValue: value?.defectsCount, status: value?.status, range: value?.reportingDateRange });
  }
  const warnings = findValue(metrics, 'policyViolationWarnings');
  push({ metric: 'Policy violation warnings', field: 'policyViolationWarnings.warningsCount', id: 'AH-54', current: warnings?.warningsCount, rawValue: warnings?.warningsCount, status: warnings?.status, range: warnings?.reportingDateRange });
  return { metrics, rating, odr, accountStatus, rows };
}

function append(workbook, name, rows, widths, { merges = [], filter = false, freeze = 0 } = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = widths.map(wch => ({ wch }));
  if (merges.length) sheet['!merges'] = merges.map(([s, e]) => ({ s: XLSX.utils.decode_cell(s), e: XLSX.utils.decode_cell(e) }));
  if (filter && rows.length > freeze) sheet['!autofilter'] = { ref: `A${freeze + 1}:${XLSX.utils.encode_col(widths.length - 1)}${rows.length}` };
  if (freeze) sheet['!views'] = [{ state: 'frozen', ySplit: freeze, topLeftCell: `A${freeze + 1}`, activePane: 'bottomLeft' }];
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  return sheet;
}

function setFormat(sheet, coordinates, format) {
  for (const address of coordinates) if (sheet[address]) sheet[address].z = format;
}

function monetarySummary(events, available) {
  if (!available) return 'Not returned by Amazon';
  if (!events.length) return 0;
  if (events.some(event => typeof event.amount !== 'number' || event.currency !== 'USD')) return 'Not returned by Amazon';
  return events.reduce((sum, event) => sum + event.amount, 0);
}

export function accountHealthWorkbook(data) {
  if (!data?.capturedAt || !Array.isArray(data.performanceMetrics)) throw Error('No saved Account Health report to export.');
  const workbook = XLSX.utils.book_new();
  const { metrics, rating, odr, accountStatus, rows: detailRows } = buildDetailRows(data);
  const marketplaceName = data.marketplaceId === 'ATVPDKIKX0DER' ? 'Amazon US' : data.marketplaceId;
  const snapshotDate = excelDate(data.capturedAt);
  const policyTotal = findValue(metrics, 'totalPolicyViolations')?.defectsCount ?? 'Not returned by Amazon';
  const claims = data.aToZClaims ?? { available: false, events: [], reason: 'Amazon Financial Events were not available during export.' };
  const claimEvents = Array.isArray(claims.events) ? claims.events : [];

  const dashboard = [
    ['ACCOUNT HEALTH DASHBOARD'], ['Amazon Seller Account • Executive summary and metric-level monitoring'], [],
    ['Marketplace account', data.marketplaceId, 'Snapshot date', snapshotDate, 'Marketplace', marketplaceName, 'Account status', accountStatus ?? 'Not returned'], [],
    ['ACCOUNT HEALTH RATING', '', 'ODR — FBA', '', 'ODR — FBM', '', 'POLICY VIOLATIONS', ''],
    [rating?.ahrScore == null ? 'Not returned' : rating.ahrScore, '', typeof odr?.afn?.rate === 'number' ? odr.afn.rate : 'Not returned', '', typeof odr?.mfn?.rate === 'number' ? odr.mfn.rate : 'Not returned', '', policyTotal, ''], [],
    ['METRIC PERFORMANCE'], ['Metric', 'Current Value', 'Target', 'Status', 'Action / Notes'],
    ...detailRows.map(row => [row.metric + (row.subMetric ? ` — ${row.subMetric}` : ''), row.current, row.target, row.status, 'Amazon SP-API report']), [],
    ['2. Order defect rate (ODR)'], ['Metric', 'Sub Metric', 'Target', 'Current', 'Status', 'Numerator', 'Denominator', 'Window from', 'Window to'],
    ...detailRows.filter(row => row.metric.startsWith('Order defect rate') || ['A-to-z claims', 'Chargebacks', 'Negative feedback'].includes(row.metric)).map(row => [row.metric, row.subMetric, row.target, row.current, row.status, row.numerator, row.denominator, row.from, row.to]),
  ];
  const odrHeadingRow = 12 + detailRows.length;
  const dash = append(workbook, 'Dashboard Preview', dashboard, [43, 23, 20, 21, 21, 17, 38, 23, 16, 18, 18], {
    merges: [['A1', 'H1'], ['A2', 'H2'], ['A6', 'B6'], ['C6', 'D6'], ['E6', 'F6'], ['G6', 'H6'], ['A7', 'B7'], ['C7', 'D7'], ['E7', 'F7'], ['G7', 'H7'], ['A9', 'G9'], [`A${odrHeadingRow}`, `K${odrHeadingRow}`]], freeze: 10,
  });
  const dashRows = detailRows.length;
  for (let index = 0; index < dashRows; index++) if (detailRows[index].rate) {
    const cell = dash[XLSX.utils.encode_cell({ r: 10 + index, c: 1 })]; if (cell && typeof cell.v === 'number') cell.z = '0.00%';
  }
  setFormat(dash, ['D4'], 'dd-mmm-yyyy');
  setFormat(dash, ['C7', 'E7'], '0.00%');

  const account = [
    ['Account Health Report'], [], ['Marketplace account', data.marketplaceId], ['Snapshot date', snapshotDate], ['Marketplace', data.marketplaceId], [],
    ['Account Health Rating', '', 'ODR FBA', 'ODR FBM', 'Policy violations (Amazon total)'], [rating?.ahrScore ?? 'Not returned', '', odr?.afn?.rate ?? 'Not returned', odr?.mfn?.rate ?? 'Not returned', policyTotal], [`Status: ${rating?.ahrStatus ?? 'Not returned'}`, '', statusText(odr?.afn?.status), statusText(odr?.mfn?.status), 'Amazon SP-API report'], [],
  ];
  const accountSections = [
    ['1. Account status and rating', detailRows.slice(0, 3)],
    ['2. Order defect rate (ODR)', detailRows.filter(row => row.metric.startsWith('Order defect rate') || ['A-to-z claims', 'Chargebacks', 'Negative feedback'].includes(row.metric))],
    ['3. Shipping and invoice performance', detailRows.filter(row => RATE_SPECS.some(spec => spec[0] === row.metric))],
    ['4. Policy compliance (violations in the window)', detailRows.filter(row => POLICY_FIELDS.some(spec => spec[0] === row.metric) || row.metric === 'Policy violation warnings')],
  ];
  const accountRows = [...account];
  for (const [heading, list] of accountSections) {
    accountRows.push([heading]);
    accountRows.push(['Metric', 'Sub Metric', 'Target', 'Current', 'Status', 'Numerator', 'Denominator', 'Window from', 'Window to', 'Metric ID']);
    accountRows.push(...list.map(row => [row.metric, row.subMetric, row.target, row.current, row.status, row.numerator, row.denominator, row.from, row.to, row.metricId]));
    accountRows.push([]);
  }
  const reportSheet = append(workbook, 'Account_Health_Report', accountRows, [43, 15, 18, 16, 17, 15, 17, 14, 15, 16, 16, 18], { freeze: 13 });
  setFormat(reportSheet, ['B4'], 'dd-mmm-yyyy');
  for (const index of accountRows.keys()) {
    const row = accountRows[index];
    const source = detailRows.find(detail => detail.metric === row?.[0] && detail.metricId === row?.[9]);
    const cell = reportSheet[`D${index + 1}`];
    if (source?.rate && cell && typeof cell.v === 'number') cell.z = '0.00%';
  }
  const claimCount = claims.available && !claims.truncated && !claims.pending ? claimEvents.length : 'Pull incomplete';
  const totalClaimAmount = monetarySummary(claimEvents, claims.available && !claims.truncated && !claims.pending);
  const claimDates = claimEvents.map(event => event.dateFiled).filter(Boolean).sort();
  const odrEndDates = ['afn', 'mfn'].map(channel => odr?.[channel]?.reportingDateRange?.reportingDateTo).filter(Boolean).sort();
  const claimsRows = [
    ['A-to-z Guarantee Claims'], [], ['Summary'], ['As of date', claimEvents.length ? excelDate(claimDates[claimDates.length - 1]) : !claims.available && odrEndDates.length ? excelDate(odrEndDates[odrEndDates.length - 1]) : 'Not returned'], ['Claims in the table', claimCount], ['Total from returned claim events (USD)', totalClaimAmount],
    ...(claims.reason ? [['Amazon data status', claims.reason]] : []),
    ...(claims.truncated ? [['Amazon returned more pages than the export limit; claim list may be incomplete.']] : []), [],
    ['Fields on the Amazon A-to-z Claims page (SP-API financial events)'], ['Date filed / posted', 'Order ID', 'Claim amount (USD)', 'Currency'],
    ...claimEvents.map(event => [excelDate(event.dateFiled), event.orderId ?? 'Not returned', event.amount ?? 'Not returned', event.currency ?? 'Not returned']),
    ...(claimEvents.length ? [] : [['No A-to-z guarantee claim events were returned by Amazon for the selected ODR reporting window.', '', '', '']]), [],
    ['Where each field comes from'], ['Field', 'Amazon page', 'Available in Amazon export?'],
    ['Order ID', 'Yes', claims.available ? 'Yes' : 'No'],
    ['Claim amount', 'Yes', claims.available ? 'Yes' : 'No'],
    ['Date filed / posted', 'Yes', claims.available ? 'Yes' : 'No'],
  ];
  const claimHeaderIndex = claimsRows.findIndex(row => row[0] === 'Date filed / posted');
  const claimSheet = append(workbook, 'A-to-z claims', claimsRows, [30, 27, 86, 24], { freeze: claimHeaderIndex });
  if (claimEvents.length) claimSheet['!autofilter'] = { ref: `A${claimHeaderIndex + 1}:D${claimHeaderIndex + claimEvents.length + 1}` };
  setFormat(claimSheet, ['B4'], 'dd-mmm-yyyy');
  for (let row = 10; row < 10 + claimEvents.length; row++) if (typeof claimSheet[`C${row}`]?.v === 'number') claimSheet[`C${row}`].z = '"$"#,##0.00';
  if (typeof totalClaimAmount === 'number' && claimSheet.B6) claimSheet.B6.z = '"$"#,##0.00';

  const snapshot = data.capturedAt.slice(0, 10);
  const dataRows = [['Account', 'Snapshot date', 'Metric ID', 'Lookup key', 'Metric', 'Value', 'Numerator', 'Denominator', 'Target', 'Target condition', 'Status', 'Window from', 'Window to', 'Source', 'Marketplace'],
    ...detailRows.map(row => ['CDC', snapshotDate, row.metricId, `CDC|${snapshot}|${row.metricId}`, row.metric, row.rawValue, row.numerator, row.denominator, row.targetValue, row.targetCondition, row.status, row.from, row.to, 'Amazon SP-API', data.marketplaceId])];
  const sourceSheet = append(workbook, 'Data', dataRows, [14, 17, 18, 35, 45, 22, 16, 16, 18, 22, 18, 17, 17, 22, 20], { freeze: 1 });
  sourceSheet['!autofilter'] = { ref: `A1:O${dataRows.length}` };
  detailRows.forEach((row, index) => { const cell = sourceSheet[`F${index + 2}`]; if (row.rate && typeof cell?.v === 'number') cell.z = '0.00%'; });

  const mapping = [['Amazon Account Health report field notes'], [], ['Standard report row', 'Metric ID', 'Definition / formula', 'In Amazon export?'],
    ...detailRows.map(row => [row.metric, row.metricId, 'Amazon-reported value; no derived substitute.', row.rawValue === '' ? 'Not returned' : 'Yes']),
    ['A-to-z claim detail rows', '', 'Amazon claim-event posted date, order ID and returned charge adjustment amounts.', claims.available ? 'Yes' : 'Not returned by Amazon']];
  const mappingSheet = append(workbook, 'Field_Mapping', mapping, [42, 17, 76, 22], { freeze: 3 });
  mappingSheet['!autofilter'] = { ref: `A3:D${mapping.length}` };
  const lists = [['Accounts', '', 'Snapshot dates', '', 'Available dates by account'], ['CDC', '', snapshotDate, '', `CDC: ${snapshot} (Amazon SP-API)`]];
  const listSheet = append(workbook, 'Lists', lists, [22, 4, 22, 4, 48]);
  setFormat(listSheet, ['C2'], 'dd-mmm-yyyy');

  workbook.Props = { Title: 'Amazon Account Health Report', Subject: 'Amazon SP-API Account Health and A-to-z claim details', Author: 'CDC Sales Intelligence' };
  return workbook;
}
