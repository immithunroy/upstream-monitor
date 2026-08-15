interface PaginationProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}

function pageItems(page: number, pages: number): Array<number | '…'> {
  const items: Array<number | '…'> = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) items.push(i);
    return items;
  }
  items.push(1);
  const start = Math.max(2, page - 2);
  const end = Math.min(pages - 1, page + 2);
  if (start > 2) items.push('…');
  for (let i = start; i <= end; i++) items.push(i);
  if (end < pages - 1) items.push('…');
  items.push(pages);
  return items;
}

export default function Pagination({ page, pages, onPage }: PaginationProps) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="text-xs text-tx3">
        Page {page} of {pages}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="rounded-lg border border-edge px-2 py-1 text-xs text-tx2 hover:bg-edge/60 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          title="Previous page"
        >
          ‹
        </button>
        {pageItems(page, pages).map((it, i) =>
          it === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-tx3">…</span>
          ) : (
            <button
              key={it}
              onClick={() => onPage(it)}
              className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                it === page ? 'bg-accent text-white' : 'text-tx2 hover:bg-edge/60'
              }`}
            >
              {it}
            </button>
          )
        )}
        <button
          className="rounded-lg border border-edge px-2 py-1 text-xs text-tx2 hover:bg-edge/60 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          title="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}