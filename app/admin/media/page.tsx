'use client';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import WaveSurfer from 'wavesurfer.js';
import {
  Play, Pause, Download, Mic, MicOff, RefreshCw, Loader2,
  PhoneCall, Clock, User, Search, X, ChevronDown, ChevronLeft, ChevronRight, Check,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/date-picker';

const RESULT_LABELS: Record<string, { label: string; color: string }> = {
  MISSED:    { label: 'Недозвон',     color: 'text-muted-foreground' },
  VOICEMAIL: { label: 'Автоответчик', color: 'text-yellow-400' },
  REFUSE:    { label: 'Отказ',        color: 'text-red-400' },
  AGREE:     { label: 'Согласие',     color: 'text-green-400' },
  CALLBACK:  { label: 'Перезвон',     color: 'text-blue-400' },
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fmtDur(sec?: number | null) {
  if (!sec) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtTime(sec: number) {
  if (!isFinite(sec) || isNaN(sec)) return '0:00';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
function buildFilename(call: any) {
  const login  = (call.operator?.login ?? 'unknown').replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '_');
  const phone  = (call.phone ?? '').replace(/[^0-9+]/g, '');
  const date   = call.startedAt
    ? new Date(call.startedAt).toLocaleString('sv-SE', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).replace(/[: ]/g, '-')
    : 'no-date';
  const RM: Record<string, string> = { MISSED: 'недозвон', VOICEMAIL: 'автоответчик', REFUSE: 'отказ', AGREE: 'согласие', CALLBACK: 'перезвон' };
  return `${login}_${phone}_${date}_${call.result ? (RM[call.result] ?? call.result) : 'без_результата'}.wav`;
}

// ── MultiSelect ───────────────────────────────────────────────────────────────
function MultiSelect({ options, value, onChange, placeholder }: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);

  const label = value.length === 0
    ? placeholder
    : value.length === 1
      ? options.find(o => o.value === value[0])?.label ?? value[0]
      : `Выбрано: ${value.length}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-2 bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-left outline-none focus:ring-1 focus:ring-ring"
      >
        <span className={value.length === 0 ? 'text-muted-foreground' : 'text-foreground truncate'}>{label}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value.length > 0 && (
            <span onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="text-muted-foreground hover:text-foreground">
              <X size={12} />
            </span>
          )}
          <ChevronDown size={13} className={`text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
            >
              <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${value.includes(opt.value) ? 'bg-primary border-primary' : 'border-border'}`}>
                {value.includes(opt.value) && <Check size={10} className="text-white" />}
              </div>
              <span className="truncate text-foreground">{opt.label}</span>
            </button>
          ))}
          {options.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Нет вариантов</div>}
        </div>
      )}
    </div>
  );
}

// ── Speed Selector ────────────────────────────────────────────────────────────
function SpeedSelector({ speed, onChange }: { speed: number; onChange: (s: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium text-muted-foreground hover:text-foreground border border-border rounded hover:bg-accent transition-colors"
        title="Скорость воспроизведения"
      >
        {speed === 1 ? '1×' : `${speed}×`}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 bottom-full mb-1 left-0 bg-card border border-border rounded-lg shadow-lg overflow-hidden py-1">
          {SPEEDS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full px-3 py-1.5 text-xs font-mono text-left hover:bg-accent transition-colors ${s === speed ? 'text-primary font-semibold' : 'text-foreground'}`}
            >
              {s === 1 ? '1× (обычная)' : `${s}×`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Audio Player Row ──────────────────────────────────────────────────────────
function RecordingRow({ rec, isActive, onActivate }: { rec: any; isActive: boolean; onActivate: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [pendingPlay, setPendingPlay] = useState(false);

  // Speed control
  const [speed, setSpeed] = useState(1);

  const call = rec.call;
  const res = call.result ? RESULT_LABELS[call.result] : null;
  const streamUrl = `/api/recordings/${call.id}/stream`;

  useEffect(() => { if (!isActive && wsRef.current) { wsRef.current.pause(); setPlaying(false); } }, [isActive]);
  useEffect(() => () => { wsRef.current?.destroy(); wsRef.current = null; }, []);

  const initWS = useCallback(() => {
    if (!containerRef.current || wsRef.current) return;
    setLoading(true); setError(false);
    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(99,102,241,0.35)', progressColor: 'rgba(99,102,241,0.9)',
      cursorColor: 'rgba(99,102,241,1)', cursorWidth: 2, barWidth: 2, barGap: 1,
      barRadius: 2, height: 48, normalize: true, interact: true, url: streamUrl,
    });
    ws.on('ready', d => { setDuration(d); setLoading(false); setReady(true); });
    ws.on('timeupdate', t => setCurrentTime(t));
    ws.on('finish', () => { setPlaying(false); setCurrentTime(0); ws.seekTo(0); });
    ws.on('error', () => { setError(true); setLoading(false); });
    wsRef.current = ws;
  }, [streamUrl]);

  const handleToggle = () => {
    onActivate();
    if (!wsRef.current) { setPendingPlay(true); initWS(); return; }
    wsRef.current.playPause();
    setPlaying(wsRef.current.isPlaying());
  };

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    wsRef.current?.setPlaybackRate(s, true);
  };

  useEffect(() => { if (ready && pendingPlay && wsRef.current) { wsRef.current.play(); setPlaying(true); setPendingPlay(false); } }, [ready, pendingPlay]);
  useEffect(() => { if (isActive && !wsRef.current && !error) initWS(); }, [isActive]);

  return (
    <div className="border-b border-border last:border-b-0 hover:bg-accent/20 transition-colors">
      <div className="grid grid-cols-[200px_1fr_90px_36px] gap-4 items-start px-4 py-3">
        {/* Left: call info */}
        <div>
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <User size={12} className="text-muted-foreground flex-shrink-0" />
            <span className="truncate">{call.operator?.name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <PhoneCall size={11} className="text-primary flex-shrink-0" />
            <span className="font-mono text-sm text-primary">{call.phone}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Clock size={10} className="text-muted-foreground flex-shrink-0" />
            <span className="text-[11px] text-muted-foreground">{fmtDate(call.startedAt)}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">{call.campaign?.name ?? '—'}</span>
            {res && <span className={`text-[10px] font-medium ${res.color}`}>{res.label}</span>}
          </div>
        </div>

        {/* Center: waveform + controls */}
        <div className="flex flex-col gap-1.5 min-w-0">
          {error ? (
            <div className="flex items-center gap-2 text-red-400 text-xs py-3"><MicOff size={14} />Файл не найден</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button onClick={handleToggle} disabled={loading}
                  className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors flex-shrink-0 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : playing ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <div ref={containerRef} className="w-full rounded-lg overflow-hidden bg-muted/30 border border-border" style={{ minHeight: 48 }} />
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono">{fmtTime(currentTime)}</span>
                      <SpeedSelector speed={speed} onChange={handleSpeedChange} />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {duration > 0 ? fmtTime(duration) : fmtDur(call.duration)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="text-sm text-muted-foreground text-center font-mono pt-2">{fmtDur(call.duration)}</div>
        <div className="flex justify-center pt-1.5">
          {!error && (
            <a href={streamUrl} download={buildFilename(call)}
              className="p-1.5 text-muted-foreground hover:text-primary transition-colors">
              <Download size={15} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 20, 50];

interface Filters {
  phone: string;
  campaigns: string[];
  operators: string[];
  results: string[];
  dateFrom: string;
  dateTo: string;
  durFrom: string;
  durTo: string;
}

const EMPTY: Filters = { phone: '', campaigns: [], operators: [], results: [], dateFrom: '', dateTo: '', durFrom: '', durTo: '' };

function hasFilters(f: Filters) {
  return f.phone !== '' || f.campaigns.length > 0 || f.operators.length > 0 || f.results.length > 0 ||
    f.dateFrom !== '' || f.dateTo !== '' || f.durFrom !== '' || f.durTo !== '';
}

export default function MediaPage() {
  useRequirePermission('MEDIA_VIEW');
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeId, setActiveId] = useState<number | null>(null);

  const setF = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setFilters(prev => ({ ...prev, [key]: val }));

  const applyFilters = () => { setApplied(filters); setSearched(true); setPage(1); setActiveId(null); };
  const clearAll = () => { setFilters(EMPTY); setApplied(EMPTY); setSearched(false); setPage(1); };

  const inputCls = 'bg-input border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring w-full';

  // Fetch all recordings only when search is applied
  const { data: recordings = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['recordings'],
    queryFn: async () => {
      const res = await fetch('/api/recordings', { credentials: 'include' });
      return res.json();
    },
    enabled: searched,
    refetchInterval: searched ? 30_000 : false,
  });

  const { data: campaigns = [] } = useQuery<any[]>({
    queryKey: ['campaigns'],
    queryFn: async () => (await fetch('/api/campaigns', { credentials: 'include' })).json(),
  });

  const { data: operators = [] } = useQuery<any[]>({
    queryKey: ['operators-list'],
    queryFn: async () => (await fetch('/api/operators', { credentials: 'include' })).json(),
  });

  // Client-side filter
  const filtered = useMemo(() => {
    if (!searched) return [];
    return recordings.filter(rec => {
      const call = rec.call;
      if (!call) return false;
      if (applied.phone && !call.phone?.includes(applied.phone)) return false;
      if (applied.campaigns.length > 0 && !applied.campaigns.includes(String(call.campaign?.id))) return false;
      if (applied.operators.length > 0 && !applied.operators.includes(String(call.operator?.id))) return false;
      if (applied.results.length > 0 && !applied.results.includes(call.result ?? '')) return false;
      if (applied.dateFrom && (!call.startedAt || new Date(call.startedAt) < new Date(applied.dateFrom))) return false;
      if (applied.dateTo) {
        const to = new Date(applied.dateTo); to.setHours(23, 59, 59, 999);
        if (!call.startedAt || new Date(call.startedAt) > to) return false;
      }
      const dur = call.duration ?? 0;
      if (applied.durFrom !== '' && dur < Number(applied.durFrom)) return false;
      if (applied.durTo !== '' && dur > Number(applied.durTo)) return false;
      return true;
    });
  }, [recordings, applied, searched]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const campaignOptions = campaigns.map((c: any) => ({ value: String(c.id), label: c.name }));
  const operatorOptions = operators.map((o: any) => ({ value: String(o.id), label: o.name }));
  const resultOptions = Object.entries(RESULT_LABELS).map(([k, v]) => ({ value: k, label: v.label }));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Mic size={20} className="text-primary" /> Мультимедиа
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Записи разговоров операторов</p>
        </div>
        {searched && (
          <button onClick={() => { refetch(); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors">
            <RefreshCw size={13} /> Обновить
          </button>
        )}
      </div>

      {/* Filter Panel */}
      <div className="bg-card border border-border rounded-xl p-5 mb-5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Фильтры поиска</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {/* Phone */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Номер телефона</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input type="text" placeholder="380..." value={filters.phone}
                onChange={e => setF('phone', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                className={inputCls + ' pl-8'} />
            </div>
          </div>

          {/* Campaign */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Кампания</label>
            <MultiSelect options={campaignOptions} value={filters.campaigns}
              onChange={v => setF('campaigns', v)} placeholder="Все кампании" />
          </div>

          {/* Operator */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Оператор</label>
            <MultiSelect options={operatorOptions} value={filters.operators}
              onChange={v => setF('operators', v)} placeholder="Все операторы" />
          </div>

          {/* Result */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Результат</label>
            <MultiSelect options={resultOptions} value={filters.results}
              onChange={v => setF('results', v)} placeholder="Все результаты" />
          </div>

          {/* Date From */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Дата от</label>
            <DatePicker value={filters.dateFrom} max={filters.dateTo || undefined} onChange={v => setF('dateFrom', v)} />
          </div>

          {/* Date To */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Дата до</label>
            <DatePicker value={filters.dateTo} min={filters.dateFrom || undefined} onChange={v => setF('dateTo', v)} />
          </div>

          {/* Duration From */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Длительность от (сек)</label>
            <input type="number" min="0" placeholder="0" value={filters.durFrom}
              onChange={e => setF('durFrom', e.target.value)} className={inputCls} />
          </div>

          {/* Duration To */}
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1 block">Длительность до (сек)</label>
            <input type="number" min="0" placeholder="∞" value={filters.durTo}
              onChange={e => setF('durTo', e.target.value)} className={inputCls} />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={applyFilters}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
            <Search size={14} /> Найти
          </button>
          {(hasFilters(filters) || searched) && (
            <button onClick={clearAll}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:text-foreground hover:bg-accent transition-colors">
              <X size={13} /> Сбросить
            </button>
          )}
        </div>
      </div>

      {/* Empty state — no search yet */}
      {!searched && (
        <div className="bg-card border border-border rounded-xl py-20 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-base font-medium text-foreground mb-1">Задайте фильтры и нажмите «Найти»</p>
          <p className="text-sm text-muted-foreground">Записи загрузятся после применения хотя бы одного фильтра</p>
        </div>
      )}

      {/* Results */}
      {searched && (
        <>
          {/* Summary + page size */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              {isLoading ? (
                <span className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Загрузка...</span>
              ) : (
                <span className="text-sm text-muted-foreground">
                  Найдено: <span className="text-foreground font-medium">{filtered.length}</span>
                  {filtered.length !== recordings.length && ` из ${recordings.length}`}
                </span>
              )}
              {filtered.length > 0 && !isLoading && (
                <span className="text-sm text-muted-foreground">
                  Страница <span className="text-foreground font-medium">{page}</span> из <span className="text-foreground font-medium">{totalPages}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Записей на странице:</span>
              {PAGE_SIZE_OPTIONS.map(s => (
                <button key={s} onClick={() => { setPageSize(s); setPage(1); }}
                  className={`w-8 h-7 text-xs rounded border transition-colors ${pageSize === s ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[200px_1fr_90px_36px] gap-4 px-4 py-2.5 border-b border-border bg-muted/40">
              {['Звонок', 'Запись', 'Длит.', ''].map((h, i) => (
                <span key={i} className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{h}</span>
              ))}
            </div>

            {isLoading && (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                <Loader2 size={16} className="animate-spin" /> Загрузка...
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <div className="py-16 text-center">
                <div className="text-4xl mb-3">🎙️</div>
                <p className="text-base font-medium text-foreground mb-1">Ничего не найдено</p>
                <p className="text-sm text-muted-foreground">Попробуйте изменить фильтры</p>
              </div>
            )}

            {paginated.map((rec: any) => (
              <RecordingRow key={rec.id} rec={rec}
                isActive={activeId === rec.id}
                onActivate={() => setActiveId(rec.id)} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && !isLoading && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                «
              </button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) { p = i + 1; }
                else if (page <= 4) { p = i + 1; }
                else if (page >= totalPages - 3) { p = totalPages - 6 + i; }
                else { p = page - 3 + i; }
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`w-9 h-9 text-sm rounded-lg border transition-colors ${p === page ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
                    {p}
                  </button>
                );
              })}

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <ChevronRight size={16} />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-3 py-1.5 text-sm border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                »
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
