const styles: Record<string, string> = {
  info: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
  critical: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300',
  good: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  service: 'bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-300',
  datacenter: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300',
  ixp: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  utility: 'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300',
  cdn: 'bg-cyan-500/10 text-cyan-700 border-cyan-500/30 dark:text-cyan-300',
};

export default function Badge({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${styles[tone] ?? styles.info}`}
    >
      {label}
    </span>
  );
}
