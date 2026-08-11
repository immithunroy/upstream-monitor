import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { SearchResults } from '../lib/types';

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      setOpen(false);
      return;
    }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.search(q);
        setResults(r);
        setOpen(true);
      } catch {
        setResults(null);
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function go(path: string) {
    setOpen(false);
    setQ('');
    navigate(path);
  }

  const groups = [
    { key: 'destinations', label: 'Destinations', items: results?.destinations ?? [] },
    { key: 'changes', label: 'Changes', items: results?.changes ?? [] },
    { key: 'reports', label: 'Destinations with reports', items: results?.reports ?? [] },
  ];

  const hasResults = groups.some((g) => g.items.length > 0);

  return (
    <div ref={boxRef} className="relative w-48 md:w-72">
      <input
        className="input pr-8"
        placeholder="Search host, ASN, company…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim().length >= 2 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {busy && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-mut">…</span>
      )}
      {open && results && (
        <div className="absolute right-0 top-full z-30 mt-1 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-edge bg-panel shadow-xl">
          {!hasResults ? (
            <div className="px-4 py-6 text-center text-sm text-tx3">No matches for “{results.query}”.</div>
          ) : (
            groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.key} className="border-b border-edge/60 last:border-0">
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-tx3">
                    {g.label}
                  </div>
                  {g.items.map((it) => (
                    <button
                      key={`${g.key}-${it.id}`}
                      onClick={() => go(it.path)}
                      className="block w-full px-3 py-2 text-left hover:bg-edge/40"
                    >
                      <div className="truncate text-sm font-medium text-tx">{it.title}</div>
                      <div className="truncate text-xs text-tx3">{it.subtitle}</div>
                    </button>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
