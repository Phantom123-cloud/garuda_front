'use client';
import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/api';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import {
  Filter, Download, ChevronDown, Check, X, Loader2, FileBarChart2,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSeconds(sec: number) {
  if (!sec || sec <= 0) return '0:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function monthStartStr() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split('T')[0];
}

type GroupBy = 'operator' | 'campaign' | 'day' | 'team';

const GROUP_LABELS: Record<GroupBy, string> = {
  operator: 'Операторы',
  campaign: 'Кампании',
  team:     'Команды',
  day:      'Дни',
};

// ─── MultiSelect ──────────────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  options: { id: number; name: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}

function MultiSelect({ label, options, selected, onChange, disabled }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  const allSelected = selected.length === 0;
  const btnLabel = allSelected ? `Все (${options.length})` : `Выбрано: ${selected.length}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={[
          'flex items-center gap-2 h-9 px-3 rounded-lg border border-border bg-background',
          'text-sm text-foreground transition-colors min-w-[180px] justify-between',
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary/60',
        ].join(' ')}
      >
        <span className="truncate text-left">
          <span className="text-muted-foreground text-xs mr-1">{label}:</span>
          {btnLabel}
        </span>
        <ChevronDown size={14} className={`flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 bg-card border border-border rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => onChange([])}
            className={[
              'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors',
              allSelected ? 'text-primary font-medium' : 'text-foreground',
            ].join(' ')}
          >
            <div className={[
              'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
              allSelected ? 'bg-primary border-primary' : 'border-border',
            ].join(' ')}>
              {allSelected && <Check size={10} className="text-primary-foreground" />}
            </div>
            Все
          </button>
          <div className="border-t border-border my-1" />
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Нет данных</p>
          )}
          {options.map(opt => {
            const checked = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
              >
                <div className={[
                  'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                  checked ? 'bg-primary border-primary' : 'border-border',
                ].join(' ')}>
                  {checked && <Check size={10} className="text-primary-foreground" />}
                </div>
                <span className="truncate">{opt.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function exportCsv(rows: any[], groupBy: GroupBy) {
  const groupLabel =
    groupBy === 'operator' ? 'Оператор' :
    groupBy === 'campaign' ? 'Кампания' :
    groupBy === 'team'     ? 'Команда' : 'День';

  const headers = [
    groupLabel,
    ...(groupBy === 'campaign' ? ['ID кампании'] : []),
    'Всего звонков',
    'Недозвонов',
    'Автоответчиков',
    'Отказов',
    'Согласий',
    'Перезвонов',
    'Время прозвона',
    'Ожидание звонка',
    'Время в паузе',
    'Время разговора',
    'Соед/час',
    'Ср. согласий',
    '% согласий',
    '% работы',
  ];

  const esc = (v: any) => {
    const s = String(v ?? '');
    return s.includes(';') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    headers.join(';'),
    ...rows.map(r => [
      esc(groupBy === 'day' ? r.day : r.name),
      ...(groupBy === 'campaign' ? [esc(r.campaignId)] : []),
      r.totalCalls,
      r.missed,
      r.autoAnswerer,
      r.refuse,
      r.agree,
      r.callback,
      esc(fmtSeconds(r.dialTime)),
      esc(fmtSeconds(r.waitTime)),
      esc(fmtSeconds(r.pauseTime)),
      esc(fmtSeconds(r.talkTime)),
      esc(fmtSeconds(Math.round(r.connectionPerHour * 3600))),
      r.agree > 0 ? r.avgAgrees : '',
      r.agree + r.refuse + r.callback > 0 ? `${r.agreePct}%` : '',
      r.workPct > 0 ? `${r.workPct}%` : '',
    ].join(';')),
  ];

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report_${groupBy}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  useRequirePermission('REPORTS_VIEW');
  const [dateFrom,     setDateFrom]     = useState(monthStartStr());
  const [dateTo,       setDateTo]       = useState(todayStr());
  const [groupBy,      setGroupBy]      = useState<GroupBy>('operator');
  const [selOperators, setSelOperators] = useState<number[]>([]);
  const [selCampaigns, setSelCampaigns] = useState<number[]>([]);
  const [selTeams,     setSelTeams]     = useState<number[]>([]);

  // Applied = submitted filter snapshot
  const [applied, setApplied] = useState<null | {
    dateFrom: string; dateTo: string; groupBy: GroupBy;
    operatorIds?: number[]; campaignIds?: number[]; teamIds?: number[];
  }>(null);

  // Filter options (operators, campaigns, teams)
  const { data: filterOpts } = useQuery({
    queryKey: ['report-filter-options'],
    queryFn: reportsApi.getFilterOptions,
    staleTime: 60_000,
  });

  // Report data — only fetches when applied is set
  const { data: rows, isFetching, isError } = useQuery({
    queryKey: ['reports-calls', applied],
    queryFn: () => reportsApi.getCalls(applied!),
    enabled: !!applied,
    staleTime: 0,
  });

  const handleApply = () => {
    setApplied({
      dateFrom,
      dateTo,
      groupBy,
      operatorIds: selOperators.length ? selOperators : undefined,
      campaignIds: selCampaigns.length ? selCampaigns : undefined,
      teamIds:     selTeams.length     ? selTeams     : undefined,
    });
  };

  const handleReset = () => {
    setDateFrom(monthStartStr());
    setDateTo(todayStr());
    setGroupBy('operator');
    setSelOperators([]);
    setSelCampaigns([]);
    setSelTeams([]);
    setApplied(null);
  };

  const operators: { id: number; name: string }[] = filterOpts?.operators ?? [];
  const campaigns: { id: number; name: string }[] = filterOpts?.campaigns ?? [];
  const teams:     { id: number; name: string }[] = filterOpts?.teams     ?? [];

  const hasData = !isFetching && !isError && rows && rows.length > 0;

  // Status-log columns are always shown — all groupings aggregate from operators
  const hasStatusCols = true;

  // Totals
  const totals = hasData
    ? rows.reduce((acc: any, r: any) => ({
        totalCalls:   acc.totalCalls   + r.totalCalls,
        missed:       acc.missed       + r.missed,
        autoAnswerer: acc.autoAnswerer + r.autoAnswerer,
        refuse:       acc.refuse       + r.refuse,
        agree:        acc.agree        + r.agree,
        callback:     acc.callback     + r.callback,
        dialTime:     acc.dialTime     + r.dialTime,
        waitTime:     acc.waitTime     + r.waitTime,
        pauseTime:    acc.pauseTime    + r.pauseTime,
        talkTime:     acc.talkTime     + r.talkTime,
      }), { totalCalls: 0, missed: 0, autoAnswerer: 0, refuse: 0, agree: 0, callback: 0, dialTime: 0, waitTime: 0, pauseTime: 0, talkTime: 0 })
    : null;

  const totContacts  = totals ? totals.refuse + totals.agree + totals.callback : 0;
  const totAgreePct  = totContacts > 0 ? parseFloat(((totals!.agree / totContacts) * 100).toFixed(1)) : 0;
  const totConnPerH  = totals && totals.dialTime > 0 ? parseFloat((totals.talkTime / totals.dialTime).toFixed(4)) : 0;
  const totAvgAgrees = totals && totals.agree > 0 ? parseFloat((totContacts / totals.agree).toFixed(2)) : 0;
  const totWorkPct   = totals && (totals.dialTime + totals.pauseTime) > 0
    ? parseFloat(((totals.dialTime / (totals.dialTime + totals.pauseTime)) * 100).toFixed(1))
    : 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <FileBarChart2 size={20} className="text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-foreground">Отчёты</h1>
            <p className="text-xs text-muted-foreground">Аналитика по звонкам</p>
          </div>
        </div>
        {hasData && (
          <button
            onClick={() => exportCsv(rows, applied!.groupBy)}
            className="flex items-center gap-2 h-9 px-4 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            <Download size={15} />
            Скачать CSV
          </button>
        )}
      </div>

      {/* ── Filter panel ── */}
      <div className="border-b border-border bg-card/50 px-6 py-4 flex-shrink-0">
        <div className="flex flex-wrap items-end gap-4">

          {/* Date range */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Период</span>
            <div className="flex items-center gap-2">
              <DatePicker value={dateFrom} max={dateTo} onChange={setDateFrom} className="w-36" />
              <span className="text-muted-foreground">—</span>
              <DatePicker value={dateTo} min={dateFrom} onChange={setDateTo} className="w-36" />
            </div>
          </div>

          {/* Grouping */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Группировка</span>
            <div className="flex items-center gap-1 h-9 p-1 rounded-lg border border-border bg-background">
              {(['operator', 'campaign', 'team', 'day'] as const).map(g => (
                <button
                  key={g} type="button"
                  onClick={() => setGroupBy(g)}
                  className={[
                    'px-3 h-full rounded-md text-sm transition-colors whitespace-nowrap',
                    groupBy === g
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {GROUP_LABELS[g]}
                </button>
              ))}
            </div>
          </div>

          {/* Operators */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Операторы</span>
            <MultiSelect label="Оператор" options={operators} selected={selOperators} onChange={setSelOperators} />
          </div>

          {/* Teams */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Команды</span>
            <MultiSelect label="Команда" options={teams} selected={selTeams} onChange={setSelTeams} />
          </div>

          {/* Campaigns */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Кампании</span>
            <MultiSelect label="Кампания" options={campaigns} selected={selCampaigns} onChange={setSelCampaigns} />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 ml-auto">
            {applied && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border text-muted-foreground text-sm hover:text-foreground transition-colors"
              >
                <X size={14} />
                Сброс
              </button>
            )}
            <button
              onClick={handleApply}
              disabled={isFetching}
              className="flex items-center gap-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isFetching
                ? <Loader2 size={14} className="animate-spin" />
                : <Filter size={14} />
              }
              Сформировать
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto px-6 py-5">

        {/* Empty state */}
        {!applied && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileBarChart2 size={32} className="text-primary/50" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-medium mb-1">Настройте фильтр и нажмите «Сформировать»</p>
              <p className="text-sm text-muted-foreground">Выберите период, операторов, кампании и группировку</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {applied && isFetching && (
          <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Формируем отчёт...</span>
          </div>
        )}

        {/* Error */}
        {applied && isError && !isFetching && (
          <div className="flex items-center justify-center h-48 text-destructive text-sm">
            Ошибка загрузки. Попробуйте ещё раз.
          </div>
        )}

        {/* No results */}
        {applied && !isFetching && !isError && rows && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <FileBarChart2 size={28} className="opacity-30" />
            <p className="text-sm">Нет данных за выбранный период</p>
          </div>
        )}

        {/* Table */}
        {hasData && (
          <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-accent/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap sticky left-0 bg-accent/30">
                    {applied!.groupBy === 'operator' ? 'Оператор' :
                     applied!.groupBy === 'campaign' ? 'Кампания' :
                     applied!.groupBy === 'team'     ? 'Команда' : 'День'}
                  </th>
                  {applied!.groupBy === 'campaign' && (
                    <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">ID</th>
                  )}
                  <Th tip="Всего звонков в выборке">Всего</Th>
                  <Th tip="Оператор выбрал результат «Недозвон»">Недозвон</Th>
                  <Th tip="Оператор выбрал результат «Автоответчик»">Автоотв.</Th>
                  <Th tip="Оператор выбрал результат «Отказ»">Отказов</Th>
                  <Th tip="Оператор выбрал результат «Согласие»">Согласий</Th>
                  <Th tip="Оператор выбрал результат «Перезвон»">Перезвон</Th>
                  <Th tip="Суммарное время звонков (startedAt→endedAt) для кампаний/дней; время в статусе IDLE для операторов/команд">Время прозвона</Th>
                  <Th tip="Время прозвона минус время разговора (чистое ожидание между звонками)">Ожидание</Th>
                  <Th tip="Суммарное время в паузе (только для операторов/команд)">Пауза</Th>
                  <Th tip="Сумма длительности разговоров: answeredAt → endedAt">Время разговора</Th>
                  <Th tip="Время разговора за 1 час прозвона (разговор / прозвон × 60 мин)">Соед/час</Th>
                  <Th tip="Среднее количество контактов на одно согласие = (Отказы + Согласия + Перезвоны) / Согласия">Ср. согласий</Th>
                  <Th tip="Согласия / (Отказы + Согласия + Перезвоны) × 100%">% согласий</Th>
                  <Th tip="Разговор / (Прозвон + Пауза) × 100% — утилизация времени (только для операторов/команд)">% работы</Th>
                </tr>
              </thead>
              <tbody>
                {(rows as any[]).map((row, i) => {
                  const contacts = row.refuse + row.agree + row.callback;
                  return (
                    <tr
                      key={row.key}
                      className={[
                        'border-b border-border/40 hover:bg-accent/20 transition-colors',
                        i % 2 === 1 ? 'bg-accent/5' : '',
                      ].join(' ')}
                    >
                      <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap sticky left-0 bg-inherit">
                        {applied!.groupBy === 'day' ? row.day : row.name}
                      </td>
                      {applied!.groupBy === 'campaign' && (
                        <td className="px-3 py-3 text-center text-xs font-mono text-muted-foreground">
                          #{row.campaignId}
                        </td>
                      )}
                      <Td>{row.totalCalls}</Td>
                      <Td>{row.missed}</Td>
                      <Td color={row.autoAnswerer > 0 ? 'text-yellow-500' : ''}>{row.autoAnswerer}</Td>
                      <Td color={row.refuse > 0 ? 'text-red-400' : ''}>{row.refuse}</Td>
                      <Td color={row.agree > 0 ? 'text-green-400' : 'text-muted-foreground'}>{row.agree}</Td>
                      <Td color={row.callback > 0 ? 'text-yellow-400' : ''}>{row.callback}</Td>
                      <Td mono>{fmtSeconds(row.dialTime)}</Td>
                      <Td mono color="text-muted-foreground">
                        {hasStatusCols ? fmtSeconds(row.waitTime) : '—'}
                      </Td>
                      <Td mono color={hasStatusCols && row.pauseTime > 0 ? 'text-orange-400' : 'text-muted-foreground'}>
                        {hasStatusCols ? fmtSeconds(row.pauseTime) : '—'}
                      </Td>
                      <Td mono>{fmtSeconds(row.talkTime)}</Td>
                      <Td mono>{fmtSeconds(Math.round(row.connectionPerHour * 3600))}</Td>
                      <Td>{row.agree > 0 ? row.avgAgrees : <span className="text-muted-foreground">—</span>}</Td>
                      <Td color={
                        contacts === 0 ? 'text-muted-foreground' :
                        row.agreePct >= 30 ? 'text-green-400' :
                        row.agreePct >= 10 ? 'text-yellow-400' : 'text-red-400'
                      }>
                        {contacts > 0 ? `${row.agreePct}%` : '—'}
                      </Td>
                      <Td color={
                        !hasStatusCols || row.workPct === 0 ? 'text-muted-foreground' :
                        row.workPct >= 40 ? 'text-green-400' :
                        row.workPct >= 20 ? 'text-yellow-400' : 'text-red-400'
                      }>
                        {hasStatusCols && row.workPct > 0 ? `${row.workPct}%` : '—'}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Totals — only when more than 1 row */}
              {rows.length > 1 && totals && (
                <tfoot>
                  <tr className="bg-accent/40 border-t-2 border-border font-semibold">
                    <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground sticky left-0 bg-accent/40">
                      Итого
                    </td>
                    {applied!.groupBy === 'campaign' && <td />}
                    <Td bold>{totals.totalCalls}</Td>
                    <Td bold>{totals.missed}</Td>
                    <Td bold color={totals.autoAnswerer > 0 ? 'text-yellow-500' : ''}>{totals.autoAnswerer}</Td>
                    <Td bold color={totals.refuse > 0 ? 'text-red-400' : ''}>{totals.refuse}</Td>
                    <Td bold color={totals.agree > 0 ? 'text-green-400' : 'text-muted-foreground'}>{totals.agree}</Td>
                    <Td bold color={totals.callback > 0 ? 'text-yellow-400' : ''}>{totals.callback}</Td>
                    <Td bold mono>{fmtSeconds(totals.dialTime)}</Td>
                    <Td bold mono color="text-muted-foreground">
                      {hasStatusCols ? fmtSeconds(totals.waitTime) : '—'}
                    </Td>
                    <Td bold mono color={hasStatusCols && totals.pauseTime > 0 ? 'text-orange-400' : 'text-muted-foreground'}>
                      {hasStatusCols ? fmtSeconds(totals.pauseTime) : '—'}
                    </Td>
                    <Td bold mono>{fmtSeconds(totals.talkTime)}</Td>
                    <Td bold mono>{fmtSeconds(Math.round(totConnPerH * 3600))}</Td>
                    <Td bold>{totals.agree > 0 ? totAvgAgrees : <span className="text-muted-foreground">—</span>}</Td>
                    <Td bold color={
                      totContacts === 0 ? 'text-muted-foreground' :
                      totAgreePct >= 30 ? 'text-green-400' :
                      totAgreePct >= 10 ? 'text-yellow-400' : 'text-red-400'
                    }>
                      {totContacts > 0 ? `${totAgreePct}%` : '—'}
                    </Td>
                    <Td bold color={
                      !hasStatusCols || totWorkPct === 0 ? 'text-muted-foreground' :
                      totWorkPct >= 40 ? 'text-green-400' :
                      totWorkPct >= 20 ? 'text-yellow-400' : 'text-red-400'
                    }>
                      {hasStatusCols && totWorkPct > 0 ? `${totWorkPct}%` : '—'}
                    </Td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Micro table components ───────────────────────────────────────────────────

function Th({ children, tip }: { children: React.ReactNode; tip?: string }) {
  return (
    <th
      title={tip}
      className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap cursor-help select-none"
    >
      {children}
    </th>
  );
}

function Td({
  children,
  color = 'text-foreground',
  mono = false,
  bold = false,
}: {
  children: React.ReactNode;
  color?: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <td className={[
      'text-center px-3 py-3 whitespace-nowrap tabular-nums',
      color,
      mono ? 'font-mono text-xs' : '',
      bold ? 'font-semibold' : '',
    ].join(' ')}>
      {children}
    </td>
  );
}
