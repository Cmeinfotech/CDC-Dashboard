'use client';
import { ChartNoAxesCombined } from 'lucide-react';

type Metric = { label: string; current: string | number; previous: string | number };
type Props = { metrics: Metric[]; period: string; previousPeriod: string };

const number = (value: string | number) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: string | number | null) => value == null ? 'Unavailable' : value.toLocaleString('en-US');

export default function SalesProfitFulfillmentChart({ metrics, period, previousPeriod }: Props) {
  const rows = ['FBA orders', 'FBM orders'].map(label => ({ label, metric: metrics.find(metric => metric.label === label) })).filter(item => item.metric);
  const values = rows.flatMap(({ metric }) => metric ? [number(metric.current), number(metric.previous)] : []).filter((value): value is number => value != null);
  const max = Math.max(1, ...values);
  return <section className="sales-fulfillment-chart" aria-label="Fulfillment orders FBA versus FBM">
    <header><div><span className="sales-fulfillment-icon"><ChartNoAxesCombined size={16} /></span><h3>Fulfillment Orders · FBA vs FBM</h3></div><div className="sales-fulfillment-legend"><span><i className="sales-bar-current" />Current</span><span><i className="sales-bar-previous" />Previous</span></div></header>
    <div className="sales-fulfillment-periods"><span>Current: {period} · Previous: {previousPeriod}</span></div>
    <div className="sales-fulfillment-bars">{rows.map(({ label, metric }) => {
      if (!metric) return null;
      const current = number(metric.current), previous = number(metric.previous);
      const change = current != null && previous ? ((current - previous) / previous) * 100 : null;
      return <div className="sales-fulfillment-group" key={label}><div className="sales-fulfillment-label">{label === 'FBA orders' ? 'FBA (Fulfilled by Amazon)' : 'FBM (Fulfilled by Merchant)'}</div><div className="sales-fulfillment-columns"><div><span className="sales-fulfillment-bar sales-bar-current" style={{ height: `${(current ?? 0) / max * 100}%` }} /><b>{count(current)}</b></div><div><span className="sales-fulfillment-bar sales-bar-previous" style={{ height: `${(previous ?? 0) / max * 100}%` }} /><b>{count(previous)}</b></div></div><small className={change != null && change < 0 ? 'down' : ''}>{change == null ? '—' : `${change >= 0 ? '▲ +' : '▼ '}${change.toFixed(1)}%`}</small></div>;
    })}</div>
  </section>;
}
