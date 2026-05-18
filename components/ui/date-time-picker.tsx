'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react';

interface DateTimePickerProps {
  value: string;           // 'YYYY-MM-DDTHH:MM' or ''
  onChange: (val: string) => void;
  className?: string;
  borderClass?: string;
}

const MONTHS_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];
const DAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toLocalStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePicker({ value, onChange, className = '', borderClass = 'border-border' }: DateTimePickerProps) {
  const parsed = value ? new Date(value) : null;

  const [open, setOpen]       = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const [viewYear, setVY]     = useState(() => parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setVM]    = useState(() => parsed?.getMonth()    ?? new Date().getMonth());
  const [selDate, setSelDate] = useState<Date | null>(parsed);
  const [hour, setHour]       = useState(() => pad(parsed?.getHours()   ?? 9));
  const [minute, setMin]      = useState(() => pad(parsed?.getMinutes() ?? 0));
  const [mounted, setMounted] = useState(false);

  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Sync state when value changes externally
  useEffect(() => {
    const p = value ? new Date(value) : null;
    setSelDate(p);
    if (p) { setVY(p.getFullYear()); setVM(p.getMonth()); setHour(pad(p.getHours())); setMin(pad(p.getMinutes())); }
  }, [value]);

  // Position dropdown relative to button (portal)
  const openDropdown = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropH = 360; // approx dropdown height
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= dropH ? rect.bottom + 4 : rect.top - dropH - 4;
    setDropPos({ top, left: rect.left, width: rect.width });
    setOpen(true);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const dropH = 360;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow >= dropH ? rect.bottom + 4 : rect.top - dropH - 4;
      setDropPos({ top, left: rect.left, width: rect.width });
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);

  function prevMonth() { if (viewMonth === 0) { setVM(11); setVY(y => y-1); } else setVM(m => m-1); }
  function nextMonth() { if (viewMonth === 11) { setVM(0); setVY(y => y+1); } else setVM(m => m+1); }

  function confirm(date: Date | null = selDate) {
    if (!date) return;
    const h = Math.min(23, Math.max(0, parseInt(hour) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minute) || 0));
    onChange(toLocalStr(new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m)));
    setOpen(false);
  }

  function goToday() {
    const t = new Date();
    setVY(t.getFullYear()); setVM(t.getMonth()); setSelDate(t);
    setHour(pad(t.getHours())); setMin(pad(t.getMinutes()));
  }

  // Calendar grid
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isSel = (d: number) => selDate?.getFullYear() === viewYear && selDate?.getMonth() === viewMonth && selDate?.getDate() === d;
  const isToday = (d: number) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;

  const displayValue = parsed
    ? parsed.toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : '';

  const dropdown = (
    <div
      ref={dropRef}
      style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, minWidth: Math.max(dropPos.width, 256), zIndex: 9999 }}
      className="bg-card border border-border rounded-xl shadow-2xl p-3 w-64"
    >
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-semibold text-foreground select-none">{MONTHS_RU[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_RU.map(d => <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-0.5 select-none">{d}</div>)}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d, i) => (
          <button key={i} type="button" disabled={!d}
            onClick={() => { if (d) setSelDate(new Date(viewYear, viewMonth, d)); }}
            className={[
              'h-7 w-full rounded-lg text-xs transition-colors select-none',
              !d ? 'invisible' :
              isSel(d!) ? 'bg-primary text-primary-foreground font-bold' :
              isToday(d!) ? 'bg-primary/15 text-primary font-semibold' :
              'hover:bg-muted text-foreground',
            ].join(' ')}
          >{d}</button>
        ))}
      </div>

      {/* Time */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
        <Clock size={13} className="text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">Время:</span>
        <input type="number" min={0} max={23} value={hour}
          onChange={e => setHour(pad(Math.min(23, Math.max(0, parseInt(e.target.value) || 0))))}
          className="w-12 text-center bg-background border border-border rounded-lg px-1 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring" />
        <span className="text-muted-foreground font-bold">:</span>
        <input type="number" min={0} max={59} value={minute}
          onChange={e => setMin(pad(Math.min(59, Math.max(0, parseInt(e.target.value) || 0))))}
          className="w-12 text-center bg-background border border-border rounded-lg px-1 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring" />
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={goToday} className="flex-1 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-lg hover:bg-muted transition-colors border border-border">Сегодня</button>
        <button type="button" onClick={() => { onChange(''); setSelDate(null); setOpen(false); }} className="flex-1 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-lg hover:bg-muted transition-colors border border-border">Очистить</button>
        <button type="button" onClick={() => confirm()} disabled={!selDate} className="flex-1 text-xs bg-primary text-primary-foreground py-1.5 rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">Готово</button>
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => open ? setOpen(false) : openDropdown()}
        className={[
          'w-full flex items-center gap-2 bg-background border rounded-lg px-3 py-2 text-sm outline-none',
          'focus:ring-2 focus:ring-ring transition-colors text-left',
          borderClass,
          open ? 'ring-2 ring-ring' : '',
        ].join(' ')}
      >
        <Calendar size={14} className="text-blue-400 flex-shrink-0" />
        <span className={displayValue ? 'text-foreground' : 'text-muted-foreground'}>
          {displayValue || 'Выберите дату и время'}
        </span>
      </button>

      {mounted && open && createPortal(dropdown, document.body)}
    </div>
  );
}
