interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1,
  );

  return (
    <nav aria-label="ترقيم الصفحات" className="flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="الصفحة السابقة"
        className="h-9 rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
      >
        السابق
      </button>
      {pages.map((p, i) => {
        const prev = pages[i - 1];
        const showEllipsis = prev !== undefined && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1">
            {showEllipsis && <span className="px-1 text-neutral-400">…</span>}
            <button
              type="button"
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={[
                "h-9 min-w-9 rounded-lg px-3 text-sm font-medium",
                p === page ? "bg-teal-600 text-white" : "text-neutral-700 hover:bg-neutral-100",
              ].join(" ")}
            >
              {p}
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="الصفحة التالية"
        className="h-9 rounded-lg px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
      >
        التالي
      </button>
    </nav>
  );
}
