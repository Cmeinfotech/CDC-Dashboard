'use client';
import { ArrowDownRight, ArrowUpRight, Minus, ChartNoAxesCombined } from 'lucide-react';
import { metricChangePresentation } from '../services/salesProfitPresentation.mjs';
import { metricComparison } from '../services/metricComparison.mjs';

type Metric = { label: string; current: string | number; previous: string | number };
type Props = { title: string; metrics: Metric[]; period: string; previousPeriod: string; format: (metric: Metric, value: string | number) => string; href: (label: string) => string; labels: Record<string, string> };
function unavailableReason(label: string, previous: boolean) {
  if (previous && /Listings|In-Stock %/.test(label)) return 'No past snapshot';
  if (label === 'Total Cost') return 'Needs product costs';
  if (label === 'Total Profit' || label === 'Profit Margin') return 'Needs full costs';
  if (['Actual Orders', 'Refund / Return Orders', 'Units per Order'].includes(label)) return 'Needs return matching';
  return 'Unavailable';
}
export default function SalesProfitComparisonChart({ title, metrics, period, previousPeriod, format, href, labels }: Props) {
  return <section className="sales-comparison-chart" aria-label={title}>
    <header className="sales-comparison-head"><div className="sales-comparison-title"><span><ChartNoAxesCombined size={18} aria-hidden="true" /></span><h3>{title}</h3></div><div className="sales-comparison-legend"><span title={period}><i className="sales-bar-current" />Current</span><span title={previousPeriod}><i className="sales-bar-previous" />Previous</span></div></header>
    <div className="sales-comparison-periods"><span><i className="sales-bar-current" />{period}</span><span><i className="sales-bar-previous" />{previousPeriod}</span></div>
    <div className="sales-comparison-rows">{metrics.map(metric => {
      const result = metricComparison(metric);
      const change = metricChangePresentation(metric,result);
      const { direction, tone, label: changeLabel } = change;
      const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
      return <a className={`sales-comparison-row${metric.label === 'Cancelled Orders' ? ' sales-row-cancelled' : ''}`} href={href(metric.label)} key={metric.label} aria-label={`${labels[metric.label] || metric.label}: current ${format(metric, metric.current)}, previous ${format(metric, metric.previous)}, change ${changeLabel}. View details.`}>
        <span className="sales-comparison-label">{labels[metric.label] || metric.label}{/Provisional|Estimated|Handling/.test(metric.label) && <small>Estimated</small>}{['Actual Orders', 'Refund / Return Orders', 'Units per Order'].includes(metric.label) && <small>As of latest refund pull</small>}{/Amazon Fees|Refunds \(Posted/.test(metric.label) && <small>Dated Amazon.com events</small>}</span>
        <span className="sales-comparison-bars">{(['current', 'previous'] as const).map(key => {
          const value = result[key]; const width = key === 'current' ? result.currentWidth : result.previousWidth;
          return <span className="sales-comparison-bar-line" key={key}><span className={`sales-comparison-track${value == null ? ' is-unavailable' : ''}`}><span className={`sales-comparison-fill sales-bar-${key}`} style={{ width: `${width ?? 0}%` }} /></span><span className={`sales-comparison-value ${key}${key === 'current' ? ` value-${tone}` : ''}`} title={`${key === 'current' ? period : previousPeriod}: ${format(metric, metric[key])}`}>{value == null && !(typeof metric[key] === 'string' && /^\d[\d,.]*–\d/.test(String(metric[key]))) ? unavailableReason(metric.label, key === 'previous') : format(metric, metric[key])}</span></span>;
        })}</span>
        <span className={`sales-comparison-change ${tone}`}><span><Icon size={13} aria-hidden="true" />{changeLabel}</span><small>{change.description}</small></span>
      </a>;
    })}</div>
  </section>;
}
