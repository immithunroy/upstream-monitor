export default function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'good' | 'bad' | 'warn';
  icon?: React.ReactNode;
}) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : tone === 'warn'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-tx';
  return (
    <div className="card flex items-start justify-between gap-2">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-tx3">{label}</div>
        <div className={`mt-1 text-3xl font-semibold ${toneCls}`}>{value}</div>
        {sub ? <div className="mt-1 text-xs text-tx3">{sub}</div> : null}
      </div>
      {icon ? <div className="mt-0.5 text-tx3">{icon}</div> : null}
    </div>
  );
}
