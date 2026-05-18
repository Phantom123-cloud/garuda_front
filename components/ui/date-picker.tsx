'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string;           // 'YYYY-MM-DD' or ''
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  min?: string;
  max?: string;
}

const MONTHS_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];
const DAYS_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toYMD(d: Date)  { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

export function DatePicker({ value, onChange, className = '', placeholder = 'Выберите дату', min, max }: DatePickerProps) {
  const parsed = value ? new Date(value + 'T00:00:00') : null;

  const [open, setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const [viewYear, setVY]  = useState(() => parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setVM] = useState(() => parsed?.getMonth()    ?? new Date().getMonth());
  const [mounted, setMounted] = useState(false);

  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const p = value ? new Date(value + 'T00:00:00') : null;
    if (p) { setVY(p.getFullYear()); setVM(p.getMonth()); }
  }, [value]);

  const openDropdown = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const dropH = 290;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= dropH ? rect.bottom + 4 : rect.top - dropH - 4;
    setDropPos({ top, left: rect.left, width: rect.width });
    setOpen(true);
  }, []);

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

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const dropH = 290;
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

  function select(d: number) {
    const ymd = toYMD(new Date(viewYear, viewMonth, d));
    if (min && ymd < min) return;
    if (max && ymd > max) return;
    onChange(ymd);
    setOpen(false);
  }

  const firstDow    = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today    = new Date();
  const todayYMD = toYMD(today);
  const isSel    = (d: number) => value === toYMD(new Date(viewYear, viewMonth, d));
  const isToday  = (d: number) => toYMD(new Date(viewYear, viewMonth, d)) === todayYMD;
  const isDisabled = (d: number) => {
    const ymd = toYMD(new Date(viewYear, viewMonth, d));
    return (!!min && ymd < min) || (!!max && ymd > max);
  };

  const displayValue = parsed
    ? parsed.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' })
    : '';

  const dropdown = (
    <div
      ref={dropRef}
      style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, minWidth: Math.max(dropPos.width, 240), zIndex: 9999 }}
      className="bg-card border border-border rounded-xl shadow-2xl p-3 w-60"
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
          <button key={i} type="button" disabled={!d || isDisabled(d!)}
            onClick={() => d && select(d)}
            className={[
              'h-7 w-full rounded-lg text-xs transition-colors select-none',
              !d ? 'invisible' :
              isDisabled(d!) ? 'text-muted-foreground/30 cursor-not-allowed' :
              isSel(d!) ? 'bg-primary text-primary-foreground font-bold' :
              isToday(d!) ? 'bg-primary/15 text-primary font-semibold' :
              'hover:bg-muted text-foreground',
            ].join(' ')}
          >{d}</button>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-border flex gap-2">
        <button type="button"
          onClick={() => { onChange(todayYMD); setVY(today.getFullYear()); setVM(today.getMonth()); setOpen(false); }}
          className="flex-1 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-lg hover:bg-muted transition-colors border border-border">
          Сегодня
        </button>
        {value && (
          <button type="button" onClick={() => { onChange(''); setOpen(false); }}
            className="flex-1 text-xs text-muted-foreground hover:text-foreground py-1.5 rounded-lg hover:bg-muted transition-colors border border-border">
            Очистить
          </button>
        )}
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
          'w-full flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none',
          'focus:ring-2 focus:ring-ring transition-colors text-left',
          open ? 'ring-2 ring-ring border-ring' : 'hover:border-muted-foreground/50',
        ].join(' ')}
      >
        <Calendar size={13} className="text-muted-foreground flex-shrink-0" />
        <span className={displayValue ? 'text-foreground' : 'text-muted-foreground'}>
          {displayValue || placeholder}
        </span>
      </button>

      {mounted && open && createPortal(dropdown, document.body)}
    </div>
  );
}
