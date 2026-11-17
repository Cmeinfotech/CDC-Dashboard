import type { ReactNode } from "react";

type KpiCardProps = {
  title: string;
  count: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
};

export default function KpiCard({ title, count, subtitle, className = "", onClick, selected = false, disabled = false }: KpiCardProps) {
  const classes = `kpi-card${className ? ` ${className}` : ""}${selected ? " is-active" : ""}`;
  const content = <><span className="kpi-card-title">{title}</span><strong className="kpi-card-count">{count}</strong>{subtitle != null && <span className="kpi-card-subtitle">{subtitle}</span>}</>;

  if (onClick) {
    return <button type="button" className={classes} aria-pressed={selected} disabled={disabled} onClick={onClick}>{content}</button>;
  }

  return <article className={classes}>{content}</article>;
}
