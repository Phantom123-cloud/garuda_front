'use client';

export type StatusFilter = 'ACTIVE' | 'BLOCKED' | 'ALL';

interface Props {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts?: { active?: number; blocked?: number; all?: number };
}

const TABS: { key: StatusFilter; label: string }[] = [
  { key: 'ACTIVE',  label: 'Активные'      },
  { key: 'BLOCKED', label: 'Заблокированные' },
  { key: 'ALL',     label: 'Все'            },
];

export function StatusFilterWidget({ value, onChange, counts }: Props) {
  const countFor = (k: StatusFilter) => {
    if (!counts) return undefined;
    if (k === 'ACTIVE')  return counts.active;
    if (k === 'BLOCKED') return counts.blocked;
    return counts.all;
  };

  return (
    <div className="flex items-center gap-1 p-1 bg-muted/40 rounded-xl border border-border">
      {TABS.map(t => {
        const c = countFor(t.key);
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              active
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t.label}
            {c !== undefined && (
              <span className={[
                'min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-semibold px-1',
                active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              ].join(' ')}>
                {c}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Keep backward-compat alias
export { StatusFilterWidget as StatusFilter };
