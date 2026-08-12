export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export function fmtRtt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v)}ms`;
}

export function fmtAgo(iso?: string | null): string {
  if (!iso) return '—';
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${Math.floor(secs)}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export const CATEGORY_LABEL: Record<string, string> = {
  service: 'Service',
  datacenter: 'Datacenter',
  ixp: 'IXP',
  utility: 'Utility',
  cdn: 'CDN',
};

/** Period-aware x-axis label for the day-bucketed period series. */
export function periodTick(period: string, day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  switch (period) {
    case 'daily':
      return d.toLocaleDateString([], { weekday: 'short' });
    case 'weekly':
      return d.toLocaleDateString([], { weekday: 'short' });
    case 'monthly':
      return d.toLocaleDateString([], { month: 'short' });
    case 'quarterly':
      return d.toLocaleDateString([], { month: 'short' });
    case 'half-yearly':
      return d.toLocaleDateString([], { month: 'short' });
    case 'yearly':
      return d.toLocaleDateString([], { month: 'short' });
    default:
      return d.toLocaleDateString([], { month: 'short' });
  }
}
