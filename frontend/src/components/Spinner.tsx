export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-tx3">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-accent" />
      {label ?? 'Loading…'}
    </div>
  );
}
