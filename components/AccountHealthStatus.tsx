function statusTone(status: string) {
  switch (status.toUpperCase()) {
    case 'GOOD':
    case 'GREAT':
    case 'ON TARGET':
    case 'HEALTHY':
    case 'NORMAL':
      return 'good';
    case 'BAD':
    case 'ACTION NEEDED':
    case 'UNHEALTHY':
      return 'bad';
    case 'WARNING':
    case 'AT RISK':
    case 'AT_RISK':
    case 'FAIR':
      return 'warning';
    default:
      return 'neutral';
  }
}

export default function AccountHealthStatus({ status, compact = false }: { status: string; compact?: boolean }) {
  return <span className="account-health-statuses">{status.split(' / ').map((value, index) =>
    <span key={`${value}-${index}`} title={value} className={`account-health-status account-health-status-${statusTone(value)}`}>{compact && /not returned/i.test(value) ? 'Unavailable' : value}</span>
  )}</span>;
}
