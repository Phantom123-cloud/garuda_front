'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { api } from '@/lib/api';
import { Phone, PhoneCall, PhoneOff, Circle, RefreshCw, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = 'call_start' | 'call_answered' | 'call_end' | 'status_change';
type TypeFilter = 'all' | 'call' | 'status';

interface ActivityEvent {
  id:           string;
  ts:           string;
  type:         EventType;
  operatorName: string;
  campaignName?: string;
  phone?:       string;
  result?:      string | null;
  durationSec?: number | null;
  status?:      string;
  pauseLabel?:  string | null;
}

interface ActivityResponse {
  events: ActivityEvent[];
  total:  number;
  page:   number;
  pages:  number;
}

// ─── Labels / helpers ─────────────────────────────────────────────────────────

const RESULT_LABEL: Record<string, string> = {
  AGREE:       'Согласие',
  REFUSE:      'Отказ',
  CALLBACK:    'Перезвон',
  MISSED:      'Недозвон',
  IN_PROGRESS: 'В работе',
  VOICEMAIL:   'Автоответчик',
};

const STATUS_LABEL: Record<string, string> = {
  IDLE:    'Ожидание',
  PAUSE:   'Пауза',
  OFFLINE: 'Офлайн',
  TALKING: 'Разговор',
  ACW:     'Запись данных',
};

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(ts: string) {
  return new Date(ts).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
function fmtDur(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}м ${s}с` : `${s}с`;
}
function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ─── Event row ────────────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: ActivityEvent }) {
  const today   = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  const dateStr = fmtDate(ev.ts);
  const timeStr = fmtTime(ev.ts);
  const datePrefix = dateStr !== today ? `${dateStr} ` : '';

  if (ev.type === 'call_start') return (
    <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/30 border-b border-border/30">
      <span className="text-[10px] text-muted-foreground/50 font-mono w-[90px] shrink-0 pt-0.5">{datePrefix}{timeStr}</span>
      <PhoneCall size={13} className="text-yellow-400 shrink-0 mt-0.5" />
      <span className="text-sm text-foreground/80">
        <span className="font-medium text-foreground">{ev.operatorName}</span>
        <span className="text-muted-foreground"> · дозвон </span>
        <span className="font-mono text-yellow-300">{ev.phone}</span>
        {ev.campaignName && <span className="text-muted-foreground"> · {ev.campaignName}</span>}
      </span>
    </div>
  );

  if (ev.type === 'call_answered') return (
    <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/30 border-b border-border/30">
      <span className="text-[10px] text-muted-foreground/50 font-mono w-[90px] shrink-0 pt-0.5">{datePrefix}{timeStr}</span>
      <Phone size={13} className="text-green-400 shrink-0 mt-0.5" />
      <span className="text-sm text-foreground/80">
        <span className="font-medium text-foreground">{ev.operatorName}</span>
        <span className="text-muted-foreground"> · ответил </span>
        <span className="font-mono text-green-300">{ev.phone}</span>
        {ev.campaignName && <span className="text-muted-foreground"> · {ev.campaignName}</span>}
      </span>
    </div>
  );

  if (ev.type === 'call_end') {
    const resultLabel = ev.result ? (RESULT_LABEL[ev.result] ?? ev.result) : 'нет результата';
    const resultColor =
      ev.result === 'AGREE'    ? 'text-green-400' :
      ev.result === 'REFUSE'   ? 'text-red-400' :
      ev.result === 'CALLBACK' ? 'text-blue-400' :
      'text-muted-foreground';
    return (
      <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/30 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground/50 font-mono w-[90px] shrink-0 pt-0.5">{datePrefix}{timeStr}</span>
        <PhoneOff size={13} className="text-muted-foreground shrink-0 mt-0.5" />
        <span className="text-sm text-foreground/80">
          <span className="font-medium text-foreground">{ev.operatorName}</span>
          <span className="text-muted-foreground"> · завершил </span>
          <span className="font-mono text-foreground/70">{ev.phone}</span>
          {ev.durationSec != null && <span className="text-muted-foreground"> · {fmtDur(ev.durationSec)}</span>}
          <span className={`font-medium ${resultColor}`}> · {resultLabel}</span>
          {ev.campaignName && <span className="text-muted-foreground"> · {ev.campaignName}</span>}
        </span>
      </div>
    );
  }

  if (ev.type === 'status_change') {
    const label =
      ev.status === 'PAUSE' && ev.pauseLabel
        ? `Пауза · ${ev.pauseLabel}`
        : (STATUS_LABEL[ev.status ?? ''] ?? ev.status);
    const color =
      ev.status === 'OFFLINE' ? 'text-muted-foreground' :
      ev.status === 'PAUSE'   ? 'text-orange-400' :
      ev.status === 'IDLE'    ? 'text-primary' :
      ev.status === 'TALKING' ? 'text-green-400' :
      'text-foreground';
    return (
      <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/30 border-b border-border/30">
        <span className="text-[10px] text-muted-foreground/50 font-mono w-[90px] shrink-0 pt-0.5">{datePrefix}{timeStr}</span>
        <Circle size={8} className={`${color} shrink-0 mt-1.5 fill-current`} />
        <span className="text-sm text-foreground/80">
          <span className="font-medium text-foreground">{ev.operatorName}</span>
          <span className="text-muted-foreground"> → </span>
          <span className={`font-medium ${color}`}>{label}</span>
        </span>
      </div>
    );
  }

  return null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  useRequirePermission('ACTIVITY_VIEW');

  const today = toInputDate(new Date());

  const [data,       setData]       = useState<ActivityResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [page,       setPage]       = useState(1);
  const [limit]                     = useState(100);
  const [dateFrom,   setDateFrom]   = useState(today);
  const [dateTo,     setDateTo]     = useState(today);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchEvents = useCallback(async (p = page) => {
    try {
      const params = new URLSearchParams({
        page:     String(p),
        limit:    String(limit),
        dateFrom: dateFrom ? `${dateFrom}T00:00:00` : '',
        dateTo:   dateTo   ? `${dateTo}T23:59:59`   : '',
        type:     typeFilter,
      });
      const res = await api.get<ActivityResponse>(`/activity?${params}`);
      setData(res.data);
      setLastUpdate(new Date());
    } catch {}
    setLoading(false);
  }, [page, limit, dateFrom, dateTo, typeFilter]);

  // Auto-refresh every 5s (only on page 1)
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    fetchEvents(page);
    if (autoRefresh && page === 1) {
      timerRef.current = setInterval(() => fetchEvents(1), 5000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [page, dateFrom, dateTo, typeFilter, autoRefresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset to page 1 when filters change
  const applyFilter = () => {
    setPage(1);
    setLoading(true);
  };

  const handleDateFrom = (v: string) => { setDateFrom(v); applyFilter(); };
  const handleDateTo   = (v: string) => { setDateTo(v);   applyFilter(); };
  const handleType     = (v: TypeFilter) => { setTypeFilter(v); applyFilter(); };

  const goPage = (p: number) => {
    setPage(p);
    setLoading(true);
  };

  const events = data?.events ?? [];
  const total  = data?.total  ?? 0;
  const pages  = data?.pages  ?? 1;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Лог активности</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Звонки и статусы операторов
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Filter size={14} className="text-muted-foreground shrink-0" />

          {/* Date from */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">С</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => handleDateFrom(e.target.value)}
              className="text-xs bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Date to */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground whitespace-nowrap">По</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => handleDateTo(e.target.value)}
              className="text-xs bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => handleType(e.target.value as TypeFilter)}
            className="text-xs bg-background border border-border rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">Все события</option>
            <option value="call">Только звонки</option>
            <option value="status">Только статусы</option>
          </select>

          {/* Auto-refresh toggle */}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Авто
          </label>

          {/* Manual refresh */}
          <button
            onClick={() => { setLoading(true); fetchEvents(page); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Обновить"
          >
            <RefreshCw size={14} />
          </button>

          {lastUpdate && (
            <span className="text-xs text-muted-foreground/50">
              {lastUpdate.toLocaleTimeString('ru-RU')}
            </span>
          )}
        </div>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Загрузка...</div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Нет событий за выбранный период</div>
        ) : (
          events.map(ev => <EventRow key={ev.id} ev={ev} />)
        )}
      </div>

      {/* Footer: legend + pagination */}
      <div className="px-6 py-2 border-t border-border shrink-0 flex items-center gap-4 flex-wrap">
        {/* Legend */}
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <PhoneCall size={10} className="text-yellow-400" /> Дозвон
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <Phone size={10} className="text-green-400" /> Ответил
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <PhoneOff size={10} /> Завершил
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <Circle size={7} className="fill-primary text-primary" /> Статус
        </span>

        {/* Spacer */}
        <span className="ml-auto" />

        {/* Total count */}
        <span className="text-[10px] text-muted-foreground/50">{total} событий</span>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => goPage(page - 1)}
              disabled={page <= 1}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {/* Page number buttons — show up to 7 around current page */}
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 2)
              .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === '…'
                  ? <span key={`ellipsis-${idx}`} className="px-1 text-[10px] text-muted-foreground/40">…</span>
                  : <button
                      key={p}
                      onClick={() => goPage(p as number)}
                      className={`min-w-[24px] h-6 px-1.5 rounded text-[10px] transition-colors ${
                        p === page
                          ? 'bg-primary text-primary-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      }`}
                    >
                      {p}
                    </button>
              )}
            <button
              onClick={() => goPage(page + 1)}
              disabled={page >= pages}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
