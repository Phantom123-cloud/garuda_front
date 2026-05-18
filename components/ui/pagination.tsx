'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  page: number;
  total: number;
  limit: number;
  onChange: (p: number) => void;
}

export function Pagination({ page, total, limit, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / limit));

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  // Build page list: always show first, last, current ± 1, with ellipsis
  const range: (number | '…')[] = [];
  const add = (n: number) => { if (!range.includes(n)) range.push(n); };
  add(1);
  if (page > 3) range.push('…');
  for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) add(i);
  if (page < pages - 2) range.push('…');
  if (pages > 1) add(pages);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {total === 0 ? '0 записей' : `${from}–${to} из ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={14} />
        </button>

        {range.map((r, i) =>
          r === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={r}
              onClick={() => onChange(r as number)}
              className={[
                'min-w-[28px] h-7 rounded-lg text-xs font-medium transition-colors',
                r === page
                  ? 'bg-primary text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              ].join(' ')}
            >
              {r}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page === pages}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
