'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Phone, PhoneOff, PhoneMissed, Coffee, BookOpen,
  Utensils, LogOut, ChevronDown, Mic, MicOff,
  Volume2, VolumeX, Clock, User, PhoneCall, Wifi, WifiOff, Loader2, RefreshCw,
  Bell, X, AlertCircle, Lock, LockOpen, Pencil, ChevronLeft, ChevronRight, Plus,
} from 'lucide-react';
import { api, authApi, campaignsApi, formsApi, scriptsApi, operatorsApi, dialerApi, numbersApi, messagesApi, callsApi, pauseReasonsApi, type Campaign, type Form, type FormField, type PauseReason as APIPauseReason } from '@/lib/api';
import { useSIP } from '@/hooks/useSIP';
import { useAdminSocket } from '@/hooks/useAdminSocket';
import { DateTimePicker } from '@/components/ui/date-time-picker';

interface ScriptStep { id: number; order: number; title: string; content: string; hint?: string | null }
interface Script { id: number; name: string; description?: string | null; steps: ScriptStep[] }

// ─── Types ────────────────────────────────────────────────────────────────────

type OperatorStatus = 'IDLE' | 'DIALING' | 'TALKING' | 'ACW' | 'PAUSE' | 'OFFLINE';

type PauseReason = APIPauseReason;

const STATUS_CONFIG: Record<OperatorStatus, { label: string; color: string; dot: string }> = {
  IDLE:    { label: 'Ожидание',   color: 'text-primary',  dot: 'bg-primary' },
  DIALING: { label: 'Дозвон...',  color: 'text-yellow-400', dot: 'bg-yellow-400' },
  TALKING: { label: 'В звонке',   color: 'text-green-400',  dot: 'bg-green-400'  },
  ACW:     { label: 'ACW',        color: 'text-orange-400', dot: 'bg-orange-400' },
  PAUSE:   { label: 'Пауза',      color: 'text-muted-foreground',  dot: 'bg-[#585870]'  },
  OFFLINE: { label: 'Офлайн',     color: 'text-muted-foreground',  dot: 'bg-[#8a8aa0]'  },
};

// ─── Result colors ────────────────────────────────────────────────────────────

const RESULT_COLORS: Record<string, string> = {
  MISSED:    'text-muted-foreground bg-muted/40',
  VOICEMAIL: 'text-yellow-400 bg-yellow-500/10',
  REFUSE:    'text-red-400 bg-red-500/10',
  AGREE:     'text-green-400 bg-green-500/10',
  CALLBACK:  'text-blue-400 bg-blue-500/10',
};

const RESULT_LABELS: Record<string, string> = {
  MISSED: 'Недозвон', VOICEMAIL: 'Автоответчик',
  REFUSE: 'Отказ', AGREE: 'Согласие', CALLBACK: 'Перезвон',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useTimer(running: boolean, initialSec = 0) {
  const [sec, setSec] = useState(initialSec);
  useEffect(() => {
    if (!running) { setSec(0); return; }
    setSec(initialSec); // reset to initial when starting
    const id = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return sec;
}

// ─── Form renderer ────────────────────────────────────────────────────────────

function OperatorForm({ form, values, onChange, resultLimits, resultCounts }: {
  form: Form;
  values: Record<string, any>;
  onChange: (key: string, val: any) => void;
  resultLimits?: Record<string, number> | null;
  resultCounts?: Record<string, number>;
}) {
  const sorted = [...form.fields].sort((a, b) => a.order - b.order);
  return (
    <div className="flex flex-col gap-4">
      {sorted.map(f => (
        <FieldInput
          key={f.id}
          field={f}
          value={values[f.id]}
          onChange={v => onChange(String(f.id), v)}
          resultLimits={resultLimits}
          resultCounts={resultCounts}
        />
      ))}
    </div>
  );
}

function FieldInput({ field, value, onChange, resultLimits, resultCounts }: {
  field: FormField;
  value: any;
  onChange: (v: any) => void;
  resultLimits?: Record<string, number> | null;
  resultCounts?: Record<string, number>;
}) {
  const base = 'bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring w-full';
  const label = (
    <label className="block text-xs text-muted-foreground mb-1.5">
      {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );

  switch (field.type) {
    case 'STRING':
      return <div>{label}<input className={base} value={value ?? ''} onChange={e => onChange(e.target.value)} /></div>;

    case 'NUMBER':
      return <div>{label}<input type="number" className={base} value={value ?? ''} onChange={e => onChange(e.target.value)} /></div>;

    case 'NOTE':
      return <div>{label}<textarea className={base + ' resize-none h-20'} value={value ?? ''} onChange={e => onChange(e.target.value)} /></div>;

    case 'CHECKBOX':
      return (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} className="accent-[#3b7efe] w-4 h-4" />
          <span className="text-sm text-foreground">{field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}</span>
        </label>
      );

    case 'DATE_EVENT':
      return (
        <div>
          {label}
          <DateTimePicker value={value ?? ''} onChange={onChange} />
        </div>
      );

    case 'DATE_CALLBACK': {
      const isLocked = value?.__locked !== false; // default true
      const dateValue = typeof value === 'object' && value !== null ? (value?.__date ?? '') : (value ?? '');
      return (
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">
            📅 {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          <div className="flex items-center gap-2">
            <DateTimePicker
              value={dateValue}
              onChange={v => onChange({ __date: v, __locked: isLocked })}
              className="flex-1"
              borderClass="border-blue-500/40"
            />
            <button
              type="button"
              title={isLocked ? 'Только этот оператор' : 'Любой оператор'}
              onClick={() => onChange({ __date: dateValue, __locked: !isLocked })}
              className={[
                'w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 transition-colors',
                isLocked
                  ? 'bg-orange-500/10 border-orange-500/40 text-orange-400 hover:bg-orange-500/20'
                  : 'bg-green-500/10 border-green-500/40 text-green-400 hover:bg-green-500/20',
              ].join(' ')}
            >
              {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            {isLocked ? '🔒 Перезвонит только этот оператор' : '🔓 Перезвонит любой свободный оператор'}
          </p>
        </div>
      );
    }

    case 'DROPDOWN': {
      const opts: string[] = field.config?.options ?? [];
      return (
        <div>
          {label}
          <select className={base + ' cursor-pointer'} value={value ?? ''} onChange={e => onChange(e.target.value)}>
            <option value="">— выберите —</option>
            {opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }

    case 'RESULT': {
      const allResults: { label: string; type: string }[] = field.config?.results ?? [];
      const COLORS: Record<string, string> = {
        MISSED: 'text-muted-foreground', VOICEMAIL: 'text-yellow-400',
        REFUSE: 'text-red-400', AGREE: 'text-green-400', CALLBACK: 'text-blue-400',
      };

      // Separate available vs exhausted results
      // limit === undefined/null → no limit (always show)
      // limit === 0              → hard block (never show)
      // limit > 0               → show until done >= limit
      const available: { label: string; type: string; remaining: number | null }[] = [];
      const exhausted: { label: string; type: string; remaining: number }[] = [];
      for (const r of allResults) {
        const limit = resultLimits != null ? resultLimits[r.label] : undefined;
        if (limit === undefined || limit === null) {
          // No limit set — always available
          available.push({ ...r, remaining: null });
        } else if (limit === 0) {
          // Explicitly blocked
          exhausted.push({ ...r, remaining: 0 });
        } else {
          const done = resultCounts?.[r.label] ?? 0;
          const rem = limit - done;
          if (rem > 0) available.push({ ...r, remaining: rem });
          else exhausted.push({ ...r, remaining: 0 });
        }
      }

      const selected = available.find(r => r.label === value);
      return (
        <div>
          {label}
          <div className="relative">
            <select
              value={value ?? ''}
              onChange={e => {
                const r = available.find(r => r.label === e.target.value);
                if (r) onChange(r.label);
              }}
              className={[
                'w-full h-10 rounded-lg border bg-input px-3 pr-8 text-sm font-medium appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-ring',
                selected ? (COLORS[selected.type] ?? 'text-foreground') + ' border-primary/50' : 'border-border text-muted-foreground',
              ].join(' ')}
            >
              <option value="">— Выберите результат —</option>
              {available.map((r, i) => (
                <option key={i} value={r.label}>
                  {r.label}{r.remaining !== null ? ` (осталось: ${r.remaining})` : ''}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          {/* Show exhausted results as disabled chips below */}
          {exhausted.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {exhausted.map((r, i) => (
                <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-border/50 text-muted-foreground line-through">
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

// ─── Script panel ─────────────────────────────────────────────────────────────

function ScriptPanel({ script, step, onStep }: { script: Script; step: number; onStep: (n: number) => void }) {
  const current = script.steps[step];
  const total = script.steps.length;
  return (
    <div className="w-80 flex-shrink-0 bg-card border-l border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <BookOpen size={14} className="text-primary flex-shrink-0" />
        <span className="text-xs font-semibold text-foreground truncate">{script.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground whitespace-nowrap">{step + 1} / {total}</span>
      </div>

      {/* Step list */}
      <div className="flex flex-col gap-1 p-2 border-b border-border overflow-y-auto max-h-32">
        {script.steps.map((s, i) => (
          <button key={s.id} onClick={() => onStep(i)}
            className={[
              'text-left px-3 py-1.5 rounded-lg text-xs transition-colors',
              i === step
                ? 'bg-primary/15 text-primary font-medium border border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            ].join(' ')}>
            <span className="text-[10px] opacity-60 mr-1.5">{i + 1}.</span>{s.title}
          </button>
        ))}
      </div>

      {/* Current step content */}
      <div className="flex-1 overflow-y-auto p-4">
        {current && (
          <>
            <h4 className="text-sm font-semibold text-foreground mb-2">{current.title}</h4>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{current.content}</p>
            {current.hint && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-xs text-yellow-400 leading-relaxed">{current.hint}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="p-3 border-t border-border flex gap-2">
        <button onClick={() => onStep(Math.max(0, step - 1))} disabled={step === 0}
          className="flex-1 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          ← Назад
        </button>
        <button onClick={() => onStep(Math.min(total - 1, step + 1))} disabled={step === total - 1}
          className="flex-1 py-1.5 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          Далее →
        </button>
      </div>
    </div>
  );
}

// ─── Pause modal ──────────────────────────────────────────────────────────────

function PauseModal({ reasons, onSelect, onClose }: { reasons: PauseReason[]; onSelect: (r: PauseReason) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-80 shadow-2xl">
        <h3 className="text-base font-semibold mb-4">Выберите причину паузы</h3>
        <div className="flex flex-col gap-2 mb-4">
          {reasons.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Причины паузы не настроены</p>
          )}
          {reasons.map(r => (
            <button key={r.id} onClick={() => onSelect(r)}
              className="px-4 py-3 rounded-xl border border-border hover:border-primary hover:bg-accent transition-all text-left w-full">
              <span className="text-sm text-foreground">{r.label}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
          Отмена
        </button>
      </div>
    </div>
  );
}

// ─── SIP status label ─────────────────────────────────────────────────────────

const SIP_STATUS_UI = {
  idle:        { icon: WifiOff,  color: 'text-muted-foreground', label: 'SIP: отключён' },
  connecting:  { icon: Loader2,  color: 'text-yellow-400',       label: 'SIP: подключение...' },
  registered:  { icon: Wifi,     color: 'text-green-400',        label: 'SIP: зарегистрирован' },
  error:       { icon: WifiOff,  color: 'text-red-400',          label: 'SIP: ошибка' },
  calling:     { icon: PhoneCall,color: 'text-yellow-400',       label: 'SIP: входящий...' },
  'in-call':   { icon: Phone,    color: 'text-green-400',        label: 'SIP: в разговоре' },
} as const;

// ─── Remap formData from old field IDs to current form field IDs ─────────────
// When a form is recreated, old calls have formData keyed by deleted field IDs.
// This function tries to map those values to the current form's fields by:
// 1. If the key already matches a current field ID → keep it
// 2. Long text (>40 chars) → NOTE field
// 3. ISO date string → DATE_CALLBACK / DATE_EVENT field
// 4. String that matches a result option label → RESULT field
// 5. Otherwise → skip (value can't be reliably placed)
function remapFormDataToCurrentFields(
  rawFormData: Record<string, any>,
  fields: FormField[],
): Record<string, any> {
  const currentIds = new Set(fields.map(f => String(f.id)));
  // Check if all keys already match current IDs → no remap needed
  const keys = Object.keys(rawFormData);
  if (keys.every(k => currentIds.has(k))) return rawFormData;

  const result: Record<string, any> = {};
  // Pass 1: keep already-matching keys
  for (const [k, v] of Object.entries(rawFormData)) {
    if (currentIds.has(k)) result[k] = v;
  }
  // Pass 2: map unknown keys by value inference
  const usedIds = new Set(Object.keys(result));
  for (const [k, v] of Object.entries(rawFormData)) {
    if (currentIds.has(k) || v === null || v === undefined || v === '') continue;
    const str = String(v);
    let targetField: FormField | undefined;
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      // ISO date → DATE_CALLBACK or DATE_EVENT
      targetField = fields.find(f => (f.type === 'DATE_CALLBACK' || f.type === 'DATE_EVENT') && !usedIds.has(String(f.id)));
    } else if (str.length > 40) {
      // Long text → NOTE
      targetField = fields.find(f => f.type === 'NOTE' && !usedIds.has(String(f.id)));
    } else {
      // Short text → STRING or NUMBER
      const resultField = fields.find(f => f.type === 'RESULT' && !usedIds.has(String(f.id)));
      if (resultField) {
        const opts: { label: string }[] = (resultField as any).config?.results ?? [];
        if (opts.some(o => o.label === str)) targetField = resultField;
      }
      if (!targetField) {
        targetField = fields.find(f => (f.type === 'STRING' || f.type === 'NUMBER') && !usedIds.has(String(f.id)));
      }
    }
    if (targetField) {
      result[String(targetField.id)] = v;
      usedIds.add(String(targetField.id));
    }
  }
  return result;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OperatorPage() {
  const router = useRouter();
  // Use operatorMe specifically to avoid admin access_token taking precedence
  const [opUser, setOpUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    authApi.operatorMe()
      .then(u => { if (u) setOpUser(u); else router.replace('/operator-login'); })
      .catch(() => router.replace('/operator-login'))
      .finally(() => setAuthLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const user = opUser;
  const operatorName = user?.name ?? user?.login ?? '—';
  const operatorLogin = user?.login ?? '—';

  const sip = useSIP();

  const [status, setStatus]           = useState<OperatorStatus>('OFFLINE');
  const [tabHidden, setTabHidden]     = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ msg: string; color: string } | null>(null);
  const [serverRestarted, setServerRestarted] = useState(false);
  // activeCampaign is loaded from DB via user.activeCampaign on mount
  const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
  const [activeForm, setActiveForm]   = useState<Form | null>(null);
  const [activeScript, setActiveScript] = useState<Script | null>(null);
  const [scriptStep, setScriptStep]   = useState(0);
  const [formValues, setFormValues]   = useState<Record<string, any>>({});
  const [currentCall, setCurrentCall] = useState<{ phone: string; callId?: number; numberData?: Record<string, any> | null } | null>(null);
  // true when the operator initiated the outbound call (redial) —
  // in this state Asterisk is calling the customer, not the operator, so
  // Answer / Reject buttons should be hidden until SIP rings back
  const [isOutboundDial, setIsOutboundDial] = useState(false);
  const [pauseReason, setPauseReason] = useState<PauseReason | null>(null);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [isMuted, setIsMuted]         = useState(false);
  const [idleTab, setIdleTab]         = useState<'wait' | 'history'>('wait');
  const [historyPage, setHistoryPage] = useState(1);
  // Edit modal
  const [editCall, setEditCall]       = useState<any | null>(null);
  const [editFormValues, setEditFormValues] = useState<Record<string, any>>({});
  const [editSaving, setEditSaving]   = useState(false);
  const [acwTimer, setAcwTimer]       = useState<number | null>(null);
  const [pauseInitialSec, setPauseInitialSec] = useState(0);
  const acwRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeCampaignRef = useRef<Campaign | null>(null);
  activeCampaignRef.current = activeCampaign;
  const campaignsRef = useRef<Campaign[]>([]);
  const autoSubmitRef = useRef<() => Promise<void>>(async () => {});

  const talkSec  = useTimer(status === 'TALKING');
  const pauseSec = useTimer(status === 'PAUSE', pauseInitialSec);

  // Sync status to DB — call whenever status or pauseReason changes
  const syncStatusToDB = useCallback((s: OperatorStatus, pr: PauseReason | null) => {
    if (!user?.id) return;
    // DIALING/TALKING are transient — persist as IDLE so the DB isn't cluttered with call states.
    // ACW is now persisted so the monitor shows correct status and available=false is guaranteed.
    const persisted = (s === 'DIALING' || s === 'TALKING') ? 'IDLE' : s;
    operatorsApi.setOnlineStatus(user.id, persisted, pr?.label ?? null).catch(() => {});
  }, [user?.id]);

  // Wrapped setters that also sync to DB
  const updateStatus = useCallback((s: OperatorStatus, pr?: PauseReason | null) => {
    setStatus(s);
    const reason = pr !== undefined ? pr : null;
    if (pr !== undefined) setPauseReason(pr);
    syncStatusToDB(s, reason);
  }, [syncStatusToDB]);

  // ── WebSocket: admin commands ─────────────────────────────────────────────
  const { connected: wsConnected } = useAdminSocket({
    operatorId: user?.id ?? null,
    onReconnect: () => {
      // Re-register full status after backend restart.
      syncStatusToDB(status, pauseReason);

      // Auto-reload if operator is not in an active call/ACW — ensures latest frontend code.
      // Safe to reload when IDLE, PAUSE, or OFFLINE (no call in progress).
      const safeToReload = status === 'IDLE' || status === 'PAUSE' || status === 'OFFLINE';
      if (safeToReload) {
        // Show countdown banner then reload
        setServerRestarted(true);
        let secs = 5;
        const iv = setInterval(() => {
          secs--;
          if (secs <= 0) {
            clearInterval(iv);
            window.location.reload();
          }
        }, 1000);
      } else {
        // In call / ACW — just show banner, don't reload
        setServerRestarted(true);
        setTimeout(() => setServerRestarted(false), 6000);
      }
    },
    onCommand: (cmd) => {
      if (cmd.type === 'kick') {
        // Force offline
        sip.unregister();
        setStatus('OFFLINE');
        setPauseReason(null);
        setActiveCampaign(null);
        setCurrentCall(null);
        setAdminNotice({ msg: 'Вас сняли с линии супервизор', color: 'bg-red-500' });
        setTimeout(() => setAdminNotice(null), 5000);
      } else if (cmd.type === 'set-pause') {
        const label = cmd.payload?.pauseReasonLabel ?? null;
        const found = pauseReasonsList.find(r => r.label === label);
        setStatus('PAUSE');
        setPauseReason(found ?? (label ? { id: 0, label, order: 0, active: true, createdAt: '' } : null));
        setPauseInitialSec(0);
        setAdminNotice({ msg: `Супервизор поставил вас на паузу: ${label ?? 'Пауза'}`, color: 'bg-orange-500' });
        setTimeout(() => setAdminNotice(null), 5000);
      } else if (cmd.type === 'set-campaign') {
        const campaign = cmd.payload?.campaign;
        if (campaign) {
          setActiveCampaign(campaign);
          setAdminNotice({ msg: `Кампания изменена: ${campaign.name}`, color: 'bg-blue-500' });
          setTimeout(() => setAdminNotice(null), 5000);
        }
      } else if (cmd.type === 'campaign-ended') {
        const reason = cmd.payload?.reason;
        const msg = reason === 'numbers-exhausted'
          ? '✅ Все номера прозвонены — база исчерпана'
          : '⏸ Кампания остановлена администратором';
        setAdminNotice({ msg, color: 'bg-yellow-600' });
        setTimeout(() => setAdminNotice(null), 8000);
        // Keep operator in IDLE but show the notice — they can switch campaign
      } else if (cmd.type === 'message') {
        // New message from supervisor — just open the bell
        refetchMessages();
        setAdminNotice({ msg: `💬 ${cmd.payload?.fromName}: ${cmd.payload?.body}`, color: 'bg-purple-600' });
        setTimeout(() => setAdminNotice(null), 8000);
        // iPhone-style message sound
        try {
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const playNote = (freq: number, delay: number, dur: number, vol: number) => setTimeout(() => {
              const ctx = new AudioCtx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain); gain.connect(ctx.destination);
              osc.type = 'sine'; osc.frequency.value = freq;
              gain.gain.setValueAtTime(vol, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
              osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur / 1000);
            }, delay);
            playNote(1318, 0, 120, 0.5);
            playNote(1568, 110, 180, 0.45);
          }
        } catch {}
      } else if (cmd.type === 'acw:force-close') {
        // Server auto-closed stale ACW — reset operator to IDLE
        setCurrentCall(null);
        updateStatus('IDLE');
        setAdminNotice({ msg: 'ACW завершён автоматически (таймаут)', color: 'bg-yellow-600' });
        setTimeout(() => setAdminNotice(null), 5000);
      } else if (cmd.type === 'call-connected') {
        // Dialer confirmed the call ID and the real customer phone.
        // Always override phone here — the SIP remote_identity shows our
        // provider's caller ID, not the customer's number.
        const { callId, phone, numberData } = cmd.payload ?? {};
        if (callId) {
          setCurrentCall(prev => prev
            ? { ...prev, callId, ...(phone ? { phone } : {}), numberData: numberData ?? prev.numberData }
            : { phone, callId, numberData });
        }
      }
    },
  });

  // Redirect non-operators to operator-login
  useEffect(() => {
    if (!authLoading && (!user || user.type !== 'operator')) {
      router.replace('/operator-login');
    }
  }, [authLoading, user, router]);

  // Restore status and campaign from DB on mount
  useEffect(() => {
    if (!user || user.type !== 'operator') return;

    // Restore campaign
    if (user.activeCampaign) {
      setActiveCampaign(user.activeCampaign as unknown as Campaign);
    }

    // Restore online status — transient call states default to IDLE
    const saved = user.onlineStatus as OperatorStatus;
    const restored: OperatorStatus =
      (saved === 'DIALING' || saved === 'TALKING' || saved === 'ACW') ? 'IDLE' : (saved ?? 'OFFLINE');

    setStatus(restored);

    // Restore pause reason if was paused
    if (restored === 'PAUSE' && user.pauseReasonLabel) {
      const found = pauseReasonsList.find((r: PauseReason) => r.label === user.pauseReasonLabel);
      setPauseReason(found ?? { id: 0, label: user.pauseReasonLabel, order: 0, active: true, createdAt: '' });
    }

    // Restore pause timer using server-computed elapsed seconds (avoids client/server clock skew).
    if (restored === 'PAUSE' && (user as any).statusElapsedSec) {
      setPauseInitialSec((user as any).statusElapsedSec);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Register SIP when operator data is ready
  useEffect(() => {
    if (user?.type === 'operator' && user.extension && user.sipPassword) {
      sip.register({
        extension: user.extension,
        sipPassword: user.sipPassword,
        asteriskHost: process.env.NEXT_PUBLIC_ASTERISK_HOST ?? '192.168.0.128',
      });
    }
    return () => { sip.unregister(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // React to incoming SIP call
  useEffect(() => {
    if (sip.status === 'calling' && sip.incomingCall) {
      // Never interrupt an active call
      if (status === 'TALKING') return;
      // ACW: forcedConnection campaigns interrupt ACW (auto-submit current form, take next call)
      if (status === 'ACW') {
        if (!(activeCampaign as any)?.forcedConnection) return;
        // Auto-submit whatever is in the form before taking the next call
        autoSubmitRef.current().catch(() => {});
      }
      // Do NOT use sip.incomingCall.remote_identity for the phone number —
      // that gives Asterisk's provider caller ID, not the customer's number.
      // The real customer phone is delivered via the 'call-connected' WS event.
      // Preserve it if already set, otherwise use a placeholder that call-connected will fill.
      setCurrentCall(prev => (prev?.phone ? prev : { phone: '' }));
      setIsOutboundDial(false); // incoming SIP ring — show Answer/Reject
      setFormValues({});
      setScriptStep(0);
      setStatus('DIALING');
      // Auto-answer if forcedConnection is enabled
      if ((activeCampaign as any)?.forcedConnection) {
        setTimeout(() => sip.answer(), 500);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sip.status, sip.incomingCall, status]);

  // React to call answered (in-call)
  useEffect(() => {
    if (sip.status === 'in-call') {
      setIsOutboundDial(false);
      setStatus('TALKING');
    }
  }, [sip.status]);

  // React to call ended by remote side
  useEffect(() => {
    if (sip.status === 'registered') {
      // Call was answered and ended normally → operator must fill ACW form
      if (status === 'TALKING') setStatus('ACW');
      // Call was never answered (cancelled/missed) → just go back to IDLE, no ACW needed
      if (status === 'DIALING') setStatus('IDLE');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sip.status]);

  // Pre-fill form fields from numberData when call-connected arrives
  // Matches numberData keys (e.g. 'ФИО', 'Страна') to form field labels
  useEffect(() => {
    if (!currentCall?.numberData || !activeForm?.fields?.length) return;
    setFormValues(prev => {
      const prefill: Record<string, any> = {};
      for (const field of activeForm.fields as any[]) {
        const val = (currentCall.numberData as Record<string, any>)[field.label];
        if (val !== undefined && val !== null && val !== '') {
          prefill[String(field.id)] = String(val);
        }
      }
      if (!Object.keys(prefill).length) return prev;
      // Operator manual entries take priority
      const merged = { ...prefill };
      for (const [k, v] of Object.entries(prev)) {
        if (v !== '' && v !== null && v !== undefined) merged[k] = v;
      }
      return merged;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall?.numberData, activeForm?.id]);

  // SIP connection dropped during active call
  useEffect(() => {
    if (sip.status === 'error') {
      if (status === 'DIALING') setStatus('IDLE');   // no call yet → just reset
      if (status === 'TALKING') setStatus('ACW');    // call dropped → ACW to save data
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sip.status]);

  // Safety guard against stuck DIALING (SIP CANCEL/BYE lost over UDP).
  // Two-layer recovery:
  //   1. Server poll: after 5 s delay, every 8 s ask the backend for this operator's status.
  //      If backend says available=true + onlineStatus=IDLE, the call was already finalized
  //      server-side — immediately reset frontend to IDLE.
  //   2. Hard timeout: if still DIALING after dialTimeout+10 s regardless of backend, force-reset.
  const dialingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialingPollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const dialingPollDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userIdRef = useRef<number | undefined>(undefined);
  userIdRef.current = user?.id;

  useEffect(() => {
    if (status !== 'DIALING') {
      // Clean up any running timers when leaving DIALING
      if (dialingTimeoutRef.current)   { clearTimeout(dialingTimeoutRef.current);   dialingTimeoutRef.current   = null; }
      if (dialingPollDelayRef.current) { clearTimeout(dialingPollDelayRef.current); dialingPollDelayRef.current = null; }
      if (dialingPollRef.current)      { clearInterval(dialingPollRef.current);      dialingPollRef.current      = null; }
      return;
    }

    // Layer 1: hard timeout (dialTimeout + 10 s)
    const hardSec = (activeCampaignRef.current?.dialTimeout ?? 25) + 10;
    dialingTimeoutRef.current = setTimeout(() => {
      setStatus(prev => prev === 'DIALING' ? 'IDLE' : prev);
    }, hardSec * 1000);

    // Layer 2: server poll starts after 5 s initial delay
    dialingPollDelayRef.current = setTimeout(() => {
      dialingPollRef.current = setInterval(async () => {
        const uid = userIdRef.current;
        if (!uid) return;
        try {
          const op = await operatorsApi.getOne(uid);
          // Backend already finalized the call — operator is idle and available
          if (op?.available === true && op?.onlineStatus === 'IDLE') {
            setStatus(prev => prev === 'DIALING' ? 'IDLE' : prev);
          }
        } catch { /* ignore network errors, hard timeout will catch edge cases */ }
      }, 8_000);
    }, 5_000);

    return () => {
      if (dialingTimeoutRef.current)   { clearTimeout(dialingTimeoutRef.current);   dialingTimeoutRef.current   = null; }
      if (dialingPollDelayRef.current) { clearTimeout(dialingPollDelayRef.current); dialingPollDelayRef.current = null; }
      if (dialingPollRef.current)      { clearInterval(dialingPollRef.current);      dialingPollRef.current      = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Mute: actually mute local stream tracks
  useEffect(() => {
    if (sip.localStream) {
      sip.localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    }
  }, [isMuted, sip.localStream]);

  // Sync availability with backend whenever status changes.
  // ACW/DIALING/TALKING: dialer manages available — don't override here.
  // IDLE → available=true, PAUSE/OFFLINE → available=false.
  // Track tab visibility — warn operator when they switch away
  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Update document title + notifications + sounds based on tab visibility and call status
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const playTone = (freq: number, dur: number, vol = 0.45) => {
      try {
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur / 1000);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur / 1000);
      } catch {}
    };

    if (status === 'RINGING') {
      document.title = '📞 Входящий звонок!';
      // Browser notification when tab is hidden
      if (tabHidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const n = new Notification('📞 Входящий звонок!', {
          body: 'Вернитесь в операторскую панель',
          icon: '/icon.svg',
          requireInteraction: true,
        });
        n.onclick = () => { window.focus(); n.close(); };
      }
      // Ring sound — two-tone beep, repeating every 2s
      if (!ringIntervalRef.current) {
        const doRing = () => {
          playTone(1000, 220, 0.55);
          setTimeout(() => playTone(800, 220, 0.5), 290);
        };
        doRing();
        ringIntervalRef.current = setInterval(doRing, 2000);
      }
    } else {
      // Stop ring when call ended/answered
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      if (status === 'IN_CALL') {
        document.title = '📞 В звонке';
      } else if (tabHidden) {
        document.title = '⚠️ Вернитесь в операторскую!';
      } else {
        document.title = 'Операторская панель';
      }
    }
    return () => {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
    };
  }, [tabHidden, status]);

  useEffect(() => {
    const handler = () => {
      const hidden = document.hidden;
      setTabHidden(hidden);
      if (hidden) {
        // subtle "ding-dong" when operator leaves the tab
        try {
          const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const play = (freq: number, delay: number) => setTimeout(() => {
              const ctx = new AudioCtx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain); gain.connect(ctx.destination);
              osc.type = 'sine'; osc.frequency.value = freq;
              gain.gain.setValueAtTime(0.25, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
              osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
            }, delay);
            for (let i = 0; i < 5; i++) {
              play(660, i * 500);
              play(440, i * 500 + 220);
            }
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

    useEffect(() => {
    if (!user?.id) return;
    if (status === 'ACW' || status === 'DIALING' || status === 'TALKING') return;
    operatorsApi.setAvailable(user.id, status === 'IDLE').catch(() => {});
  }, [status, user?.id]);

  // Mark unavailable on page unload
  useEffect(() => {
    const markUnavailable = () => {
      if (user?.id) operatorsApi.setAvailable(user.id, false).catch(() => {});
    };
    window.addEventListener('beforeunload', markUnavailable);
    return () => {
      window.removeEventListener('beforeunload', markUnavailable);
      markUnavailable();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const { data: campaigns = [] } = useQuery<Campaign[]>({
    queryKey: ['campaigns'],
    queryFn: campaignsApi.getAll,
    refetchInterval: 30_000, // refresh every 30s so acwTimeout changes propagate
  });

  // Keep campaignsRef in sync so ACW effect always reads the latest acwTimeout
  campaignsRef.current = campaigns;

  // Sync activeCampaign with fresh data from campaigns list (picks up admin changes)
  useEffect(() => {
    if (!activeCampaign || campaigns.length === 0) return;
    const fresh = campaigns.find(c => c.id === activeCampaign.id);
    if (fresh && (fresh as any).acwTimeout !== (activeCampaign as any).acwTimeout) {
      setActiveCampaign(fresh);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);

  // Load active pause reasons from API
  const { data: pauseReasonsList = [] } = useQuery<PauseReason[]>({
    queryKey: ['pause-reasons-active'],
    queryFn: pauseReasonsApi.getActive,
    staleTime: 60_000,
  });

  // Page refresh block during active call
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === 'TALKING' || status === 'DIALING') {
        e.preventDefault();
        e.returnValue = 'Вы находитесь в активном звонке. Уверены, что хотите покинуть страницу?';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);

  // Incoming messages from supervisor
  const [showMessages, setShowMessages] = useState(false);
  const { data: unreadMessages = [], refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ['operator-messages-unread', user?.id],
    queryFn: () => messagesApi.getMy(true),
    enabled: !!user?.id,
    refetchInterval: 10_000,
  });
  const { data: allMessages = [] } = useQuery<any[]>({
    queryKey: ['operator-messages-all', user?.id],
    queryFn: () => messagesApi.getMy(false),
    enabled: showMessages && !!user?.id,
  });
  const markAllRead = async () => {
    if (user?.id && unreadMessages.length > 0) {
      await messagesApi.markAllRead(user.id);
      refetchMessages();
    }
  };

  // Result counts for active campaign (to filter limited results)
  const { data: resultCounts = {}, refetch: refetchResultCounts } = useQuery<Record<string, number>>({
    queryKey: ['result-counts', activeCampaign?.id],
    queryFn: () => campaignsApi.getResultCounts(activeCampaign!.id),
    enabled: !!activeCampaign?.id,
    refetchInterval: 10_000,
  });

  const resultLimits = (activeCampaign as any)?.resultLimits as Record<string, number> | null | undefined;

  // Build enum→custom label map from active form's RESULT field config
  // e.g. AGREE → "CALL BACK", REFUSE → "HANG UP"
  const resultFormField = activeForm?.fields?.find((f: any) => f.type === 'RESULT');
  const enumToCustomLabel = new Map<string, string>();
  for (const opt of (resultFormField as any)?.config?.results ?? []) {
    if (opt.type && opt.label) enumToCustomLabel.set(opt.type, opt.label);
  }
  // Resolve call result label: custom form label > formData lookup > hardcoded > raw enum
  const resolveResultLabel = (call: any): string => {
    if (!call?.result) return '';
    // IN_PROGRESS = internal state (ACW ended without operator submitting result). Show nothing.
    if (call.result === 'IN_PROGRESS') return '';
    // 1. Scan formData for a value matching a known custom result label
    if (call.formData && typeof call.formData === 'object') {
      for (const val of Object.values(call.formData as Record<string, any>)) {
        if (typeof val === 'string' && enumToCustomLabel.size > 0) {
          // Check if this value is one of the custom result labels
          const isResultLabel = Array.from(enumToCustomLabel.values()).includes(val);
          if (isResultLabel) return val;
        }
      }
    }
    // 2. Map enum type → custom label via form config
    const customLabel = enumToCustomLabel.get(call.result);
    if (customLabel) return customLabel;
    // 3. Fallback to hardcoded Russian labels
    return RESULT_LABELS[call.result] ?? call.result;
  };

  // Campaign call history (for history tab) — grouped by phone, only calls handled by this operator
  const { data: groupedHistory, refetch: refetchCampaignCalls } = useQuery<{
    data: { phone: string; lastCall: any; previousCalls: any[] }[];
    total: number; page: number; totalPages: number;
  }>({
    queryKey: ['campaign-calls-grouped', activeCampaign?.id, historyPage, user?.id],
    queryFn: () => callsApi.getGroupedByPhone(activeCampaign!.id, historyPage, user?.id),
    enabled: !!activeCampaign?.id && !!user?.id && idleTab === 'history',
  });
  const campaignGroups = groupedHistory?.data ?? [];
  const totalHistoryPages = groupedHistory?.totalPages ?? 1;
  // Expanded accordion rows: Set of phone strings
  const [expandedPhones, setExpandedPhones] = useState<Set<string>>(new Set());
  const togglePhone = (phone: string) => setExpandedPhones(prev => {
    const next = new Set(prev);
    if (next.has(phone)) next.delete(phone);
    else next.add(phone);
    return next;
  });

  // Operator today stats (refreshes every 30s and after each call)
  const { data: todayStats, refetch: refetchTodayStats } = useQuery({
    queryKey: ['operator-today', user?.id],
    queryFn: () => callsApi.getOperatorToday(user!.id),
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  const redialMutation = useMutation({
    mutationFn: (phone: string) => dialerApi.callPhone(phone, activeCampaign!.id),
    onSuccess: (data) => {
      setCurrentCall({ phone: data.phone });
      setIsOutboundDial(true);
      setStatus('DIALING');
      setScriptStep(0);
      setIdleTab('wait');
    },
  });

  // Load form + script when campaign selected
  useEffect(() => {
    if (activeCampaign?.form?.id) {
      formsApi.getOne(activeCampaign.form.id).then(setActiveForm).catch(() => setActiveForm(null));
    } else {
      setActiveForm(null);
    }
    if (activeCampaign?.script?.id) {
      scriptsApi.getOne(activeCampaign.script.id).then(s => { setActiveScript(s); setScriptStep(0); }).catch(() => setActiveScript(null));
    } else {
      setActiveScript(null);
    }
  }, [activeCampaign]);

  // Auto-submit IN_PROGRESS when ACW timer expires — always reads latest values via refs
  const autoSubmitInProgress = useCallback(async () => {
    if (currentCall) {
      try {
        await api.patch('/calls/operator-result', {
          phone: currentCall.phone,
          callId: currentCall.callId,
          result: 'IN_PROGRESS',
          formData: Object.keys(formValues).length > 0 ? formValues : undefined,
        });
      } catch {}
    }
    setCurrentCall(null);
    setFormValues({});
    updateStatus('IDLE', null);
    refetchTodayStats();
    refetchResultCounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCall, formValues]);

  // Keep ref always up-to-date so stale closures in the interval always call the latest version
  autoSubmitRef.current = autoSubmitInProgress;

  // ACW countdown — reads timeout from campaignsRef (always fresh) to avoid stale closure
  useEffect(() => {
    if (status !== 'ACW') {
      if (acwRef.current) { clearInterval(acwRef.current); acwRef.current = null; }
      return;
    }

    // Prefer fresh data from campaigns list; fall back to activeCampaign state
    const freshCampaign = campaignsRef.current.find(c => c.id === activeCampaignRef.current?.id);
    const timeout = (freshCampaign ?? activeCampaignRef.current)?.acwTimeout ?? null;

    if (timeout === null || timeout === undefined) {
      // Unlimited ACW — no countdown
      setAcwTimer(null);
      if (acwRef.current) { clearInterval(acwRef.current); acwRef.current = null; }
      return;
    }

    setAcwTimer(timeout);
    acwRef.current = setInterval(() => {
      setAcwTimer(t => {
        if (t === null || t <= 1) {
          clearInterval(acwRef.current!);
          acwRef.current = null;
          autoSubmitRef.current(); // always calls the latest version
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => { if (acwRef.current) { clearInterval(acwRef.current); acwRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const goOnline = () => {
    if (!activeCampaign) { setShowCampaignPicker(true); return; }
    updateStatus('IDLE', null);
  };

  const startPause = () => setShowPauseModal(true);

  const confirmPause = (r: PauseReason) => {
    updateStatus('PAUSE', r);
    setShowPauseModal(false);
  };

  const resumeFromPause = () => { updateStatus('IDLE', null); };

  const goOffline = () => {
    sip.unregister();
    updateStatus('OFFLINE', null);
    setActiveCampaign(null);
    setCurrentCall(null);
    // Clear active campaign in DB
    if (user?.id) {
      operatorsApi.setActiveCampaign(user.id, null).catch(() => {});
    }
  };

  // Answer incoming SIP call
  const answerCall = () => {
    sip.answer();
  };

  const endCall = () => {
    sip.hangup();
    setStatus('ACW');
  };

  const saveAndNext = async () => {
    // Save result to backend
    if (currentCall) {
      try {
        // Find RESULT field, get selected label, then map to enum type
        const resultField = activeForm?.fields?.find((f: any) => f.type === 'RESULT');
        const selectedLabel = resultField?.id != null ? (formValues[String(resultField.id)] || null) : null;
        const resultType = selectedLabel
          ? ((resultField?.config?.results ?? []) as any[]).find((r: any) => r.label === selectedLabel)?.type ?? null
          : null;

        // Extract callbackLocked from DATE_CALLBACK field values and flatten object values to date strings
        let callbackLocked = true; // default: locked to same operator
        const processedFormData: Record<string, any> = { ...formValues };
        for (const [key, val] of Object.entries(formValues)) {
          if (val && typeof val === 'object' && '__date' in val) {
            callbackLocked = (val as any).__locked !== false;
            processedFormData[key] = (val as any).__date; // store just the date string
          }
        }

        const saved = await api.patch('/calls/operator-result', {
          phone: currentCall.phone,
          callId: currentCall.callId,
          result: resultType || null,
          formData: Object.keys(processedFormData).length > 0 ? processedFormData : undefined,
          ...(resultType === 'CALLBACK' ? { callbackLocked } : {}),
        });
        if (!saved) {
          setAdminNotice({ msg: '⚠️ Результат не сохранён — звонок не найден в системе', color: 'bg-red-600' });
          setTimeout(() => setAdminNotice(null), 6000);
        }
      } catch (e) {
        setAdminNotice({ msg: '⚠️ Ошибка сохранения результата', color: 'bg-red-600' });
        setTimeout(() => setAdminNotice(null), 6000);
      }
    }
    setCurrentCall(null);
    setFormValues({});
    updateStatus('IDLE', null);
    refetchTodayStats();
    refetchResultCounts();
  };

  const selectCampaign = (c: Campaign) => {
    setActiveCampaign(c);
    setShowCampaignPicker(false);
    setExpandedPhones(new Set());
    setHistoryPage(1);
    // Use updateStatus so the IDLE state is also persisted to DB —
    // without this, page refresh reads OFFLINE from DB and kicks back to campaign picker
    updateStatus('IDLE', null);
    // Persist active campaign in DB
    if (user?.id) {
      operatorsApi.setActiveCampaign(user.id, c.id).catch(() => {});
    }
  };

  const cfg = STATUS_CONFIG[status];
  const sipUi = SIP_STATUS_UI[sip.status];

  // Show fullscreen loader while auth is resolving
  if (authLoading) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-background gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* ── Admin notice toast ── */}
      {adminNotice && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl ${adminNotice.color} text-white text-sm font-medium shadow-lg`}>
          <AlertCircle size={15} />
          {adminNotice.msg}
        </div>
      )}

      {/* ── Top bar ── */}
      <header className="h-14 bg-card border-b border-border flex items-center justify-between px-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="text-base font-bold text-foreground">📞 Garuda ATS</div>
          <span className="text-xs text-muted-foreground">/ Рабочее место оператора</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Campaign badge */}
          {activeCampaign ? (
            <button onClick={() => status === 'IDLE' && setShowCampaignPicker(true)}
              className="flex items-center gap-2 bg-accent border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:border-primary transition-colors">
              <PhoneCall size={13} />
              {activeCampaign.name}
              {status === 'IDLE' && <ChevronDown size={12} />}
            </button>
          ) : (
            <button onClick={() => setShowCampaignPicker(true)}
              className="flex items-center gap-2 bg-primary/10 border border-primary/40 rounded-lg px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors animate-pulse">
              Выбрать кампанию
            </button>
          )}

          {/* Messages bell */}
          <button onClick={() => { setShowMessages(m => !m); if (!showMessages) markAllRead(); }}
            className="relative p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Bell size={15} />
            {unreadMessages.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] text-white font-bold flex items-center justify-center animate-bounce">
                {unreadMessages.length > 9 ? '9+' : unreadMessages.length}
              </span>
            )}
          </button>

          {/* WS reconnect indicator */}
          {user?.id && !wsConnected && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-400 animate-pulse">
              <WifiOff size={12} />
              Переподключение...
            </div>
          )}

          {/* Server restarted banner */}
          {serverRestarted && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg animate-pulse">
              <AlertCircle size={12} />
              {(status === 'IDLE' || status === 'PAUSE' || status === 'OFFLINE')
                ? 'Сервер перезапущен — перезагрузка через 5 сек...'
                : 'Сервер перезапущен — статус восстановлен'}
            </div>
          )}

          {/* SIP status */}
          <div className={`flex items-center gap-1.5 text-xs font-medium ${sipUi.color}`}>
            <sipUi.icon size={12} className={sip.status === 'connecting' ? 'animate-spin' : ''} />
            {sipUi.label}
          </div>

          {/* Status pill */}
          <div className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
            <span className={`w-2 h-2 rounded-full ${cfg.dot} ${status === 'TALKING' ? 'animate-pulse' : ''}`} />
            {cfg.label}
            {status === 'PAUSE' && pauseReason && ` — ${pauseReason.label}`}
          </div>

          {/* Operator */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xs font-semibold">
              {operatorName.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
            </div>
            <div className="text-xs">
              <div className="text-foreground">{operatorName}</div>
              <div className="text-muted-foreground">{operatorLogin}</div>
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={async () => {
              // Set OFFLINE in DB before clearing the session cookie — otherwise the monitor
              // and dialer keep seeing the operator as available after logout.
              if (user?.id) {
                sip.unregister();
                await Promise.all([
                  operatorsApi.setOnlineStatus(user.id, 'OFFLINE', null).catch(() => {}),
                  operatorsApi.setAvailable(user.id, false).catch(() => {}),
                  operatorsApi.setActiveCampaign(user.id, null).catch(() => {}),
                ]);
              }
              await authApi.operatorLogout().catch(() => {});
              window.location.href = '/operator-login';
            }}
            title="Выйти из системы"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left: controls ── */}
        <div className="w-72 bg-card border-r border-border flex flex-col flex-shrink-0">

          {/* Status controls */}
          <div className="p-4 border-b border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Управление статусом</p>
            <div className="flex flex-col gap-2">
              {status === 'OFFLINE' && (
                <button onClick={goOnline}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-medium transition-colors">
                  <Phone size={15} /> Начать работу
                </button>
              )}
              {(status === 'IDLE' || status === 'ACW') && (
                <>
                  <button onClick={startPause}
                    className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-[#252530] rounded-xl text-sm text-foreground transition-colors">
                    <Coffee size={15} className="text-yellow-400" /> Уйти на паузу
                  </button>
                  <button onClick={goOffline}
                    className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-[#252530] rounded-xl text-sm text-muted-foreground transition-colors">
                    <LogOut size={15} /> Завершить смену
                  </button>
                </>
              )}
              {status === 'PAUSE' && (
                <>
                  <button onClick={resumeFromPause}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-[#6b84ff] rounded-xl text-sm font-medium transition-colors">
                    <Phone size={15} /> Вернуться к работе
                  </button>
                  <button onClick={goOffline}
                    className="flex items-center gap-2 px-4 py-2.5 bg-accent hover:bg-[#252530] rounded-xl text-sm text-muted-foreground transition-colors">
                    <LogOut size={15} /> Завершить смену
                  </button>
                </>
              )}
              {status === 'DIALING' && !isOutboundDial && !(activeCampaign as any)?.forcedConnection && (
                <>
                  <button onClick={answerCall}
                    className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-medium transition-colors">
                    <Phone size={15} /> Ответить
                  </button>
                  <button onClick={endCall}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-medium transition-colors">
                    <PhoneOff size={15} /> Отклонить
                  </button>
                </>
              )}
              {status === 'DIALING' && isOutboundDial && (
                <button onClick={() => { setIsOutboundDial(false); endCall(); }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-medium transition-colors">
                  <PhoneOff size={15} /> Отменить набор
                </button>
              )}
              {status === 'TALKING' && (
                <button onClick={endCall}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl text-sm font-medium transition-colors">
                  <PhoneOff size={15} /> Завершить звонок
                </button>
              )}
            </div>
          </div>

          {/* Call controls (mute/speaker) */}
          {(status === 'TALKING' || status === 'DIALING') && (
            <div className="p-4 border-b border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Звонок</p>
              <div className="flex gap-2">
                <button onClick={() => setIsMuted(m => !m)}
                  className={['flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm transition-colors border',
                    isMuted ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-accent border-border text-muted-foreground hover:text-foreground',
                  ].join(' ')}>
                  {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm transition-colors border bg-accent border-border text-muted-foreground cursor-default opacity-50"
                  disabled
                >
                  <Volume2 size={14} /> Динамик
                </button>
              </div>
            </div>
          )}

          {/* Timers */}
          <div className="p-4 border-b border-border">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Таймеры</p>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1.5"><Clock size={13} /> Звонок</span>
                <span className={`font-mono font-semibold ${status === 'TALKING' ? 'text-green-400' : 'text-muted-foreground'}`}>
                  {fmtTime(talkSec)}
                </span>
              </div>
              {status === 'PAUSE' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5"><Coffee size={13} /> Пауза</span>
                  <span className="font-mono font-semibold text-yellow-400">{fmtTime(pauseSec)}</span>
                </div>
              )}
              {status === 'ACW' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">ACW осталось</span>
                  <span className={`font-mono font-semibold ${acwTimer !== null && acwTimer <= 10 ? 'text-red-400' : 'text-orange-400'}`}>
                    {acwTimer === null ? '∞' : fmtTime(acwTimer)}
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Center: active call / ACW ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── Global tab bar (always visible when campaign selected) ── */}
          {activeCampaign && (
            <div className="flex border-b border-border flex-shrink-0 bg-card/50">
              <button
                onClick={() => setIdleTab('wait')}
                className={['px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  idleTab === 'wait' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {status === 'TALKING' ? 'Разговор' : status === 'DIALING' ? 'Дозвон' : status === 'ACW' ? 'Обработка' : status === 'PAUSE' ? 'Пауза' : 'Ожидание'}
              </button>
              <button
                onClick={() => setIdleTab('history')}
                className={['px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                  idleTab === 'history' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                История кампании
              </button>
            </div>
          )}

          {/* ── История кампании (any status) ── */}
          {idleTab === 'history' && activeCampaign && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
                <p className="text-sm font-semibold text-foreground">История кампании</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                {campaignGroups.length === 0 ? (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Нет звонков в кампании</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/30 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-2.5 w-6" />
                        <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Номер</th>
                        <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Дата/время</th>
                        <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Результат</th>
                        <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Длит.</th>
                        <th className="px-4 py-2.5 w-24" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {campaignGroups.map(({ phone, lastCall, previousCalls }) => {
                        const isOpen = expandedPhones.has(phone);
                        const hasPrev = previousCalls.length > 0;
                        return (
                          <>
                            {/* ── Main row (last call) ── */}
                            <tr key={`main-${phone}`} className="hover:bg-accent/30 transition-colors">
                              {/* Accordion toggle */}
                              <td className="px-2 py-3 text-center">
                                {hasPrev ? (
                                  <button
                                    onClick={() => togglePhone(phone)}
                                    className={['w-5 h-5 flex items-center justify-center rounded transition-colors text-muted-foreground hover:text-foreground', isOpen ? 'rotate-90' : ''].join(' ')}
                                  >
                                    <ChevronRight size={13} />
                                  </button>
                                ) : <span className="w-5 h-5 block" />}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs font-medium">{phone}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {lastCall ? new Date(lastCall.startedAt).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td className="px-4 py-3">
                                {lastCall?.result ? (
                                  <span className={['text-[11px] font-medium px-2 py-0.5 rounded-full', RESULT_COLORS[lastCall.result] ?? 'text-muted-foreground bg-muted/40'].join(' ')}>
                                    {resolveResultLabel(lastCall)}
                                  </span>
                                ) : <span className="text-[11px] text-muted-foreground">—</span>}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                                {lastCall?.duration != null ? fmtTime(lastCall.duration) : '—'}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    title="Перезвонить"
                                    disabled={status === 'TALKING' || status === 'DIALING' || status === 'ACW' || redialMutation.isPending}
                                    onClick={() => redialMutation.mutate(phone)}
                                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <Phone size={13} />
                                  </button>
                                  {lastCall && (
                                    <button
                                      title="Редактировать"
                                      onClick={() => {
                                        setEditCall(lastCall);
                                        const raw = lastCall.formData ? { ...lastCall.formData } : {};
                                        setEditFormValues(
                                          activeForm?.fields?.length
                                            ? remapFormDataToCurrentFields(raw, activeForm.fields)
                                            : raw
                                        );
                                      }}
                                      className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                    >
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* ── Accordion: previous calls ── */}
                            {isOpen && previousCalls.map((prev: any) => (
                              <tr key={`prev-${prev.id}`} className="bg-muted/20">
                                <td className="px-2 py-2" />
                                <td className="px-4 py-2 text-xs text-muted-foreground font-mono pl-8">↳</td>
                                <td className="px-4 py-2 text-xs text-muted-foreground">
                                  {new Date(prev.startedAt).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="px-4 py-2">
                                  {prev.result ? (
                                    <span className={['text-[11px] font-medium px-2 py-0.5 rounded-full', RESULT_COLORS[prev.result] ?? 'text-muted-foreground bg-muted/40'].join(' ')}>
                                      {resolveResultLabel(prev)}
                                    </span>
                                  ) : <span className="text-[11px] text-muted-foreground">—</span>}
                                </td>
                                <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                                  {prev.duration != null ? fmtTime(prev.duration) : '—'}
                                </td>
                                <td className="px-4 py-2" />
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="px-4 py-2.5 border-t border-border flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-muted-foreground">
                  Страница {historyPage} из {totalHistoryPages} · {groupedHistory?.total ?? 0} номеров
                </span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))} disabled={historyPage >= totalHistoryPages}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Status-based content (only when Ожидание tab active) ── */}
          {(idleTab === 'wait' || !activeCampaign) && <>

          {/* Offline / no campaign */}
          {status === 'OFFLINE' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4">📴</div>
                <p className="text-lg font-semibold text-foreground">Смена не начата</p>
                <p className="text-sm text-muted-foreground mt-1 mb-6">Выберите кампанию и нажмите «Начать работу»</p>
                <button onClick={() => setShowCampaignPicker(true)}
                  className="px-5 py-2.5 bg-primary hover:bg-[#6b84ff] rounded-xl text-sm font-medium transition-colors">
                  Выбрать кампанию
                </button>
              </div>
            </div>
          )}

          {/* Idle */}
          {status === 'IDLE' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 flex overflow-hidden">
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto mb-5 animate-pulse">
                        <Phone size={36} className="text-primary" />
                      </div>
                      <p className="text-base font-medium text-foreground">Ожидание звонка</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Кампания: <span className="text-primary">{activeCampaign?.name ?? '—'}</span>
                      </p>
                    </div>
                  </div>
                  {activeScript && activeScript.steps.length > 0 && (
                    <ScriptPanel script={activeScript} step={scriptStep} onStep={setScriptStep} />
                  )}
                </div>
            </div>
          )}

          {/* Pause */}
          {status === 'PAUSE' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-yellow-500/10 border-2 border-yellow-500/30 flex items-center justify-center mx-auto mb-5">
                  <Coffee size={36} className="text-yellow-400" />
                </div>
                <p className="text-base font-medium text-foreground">Пауза</p>
                <p className="text-sm text-muted-foreground mt-1">{pauseReason?.label}</p>
                <p className="text-2xl font-mono font-bold text-yellow-400 mt-4">{fmtTime(pauseSec)}</p>
              </div>
            </div>
          )}

          {/* Dialing */}
          {status === 'DIALING' && currentCall && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-yellow-500/10 border-2 border-yellow-500/30 flex items-center justify-center mx-auto mb-5 animate-pulse">
                  <PhoneCall size={36} className="text-yellow-400" />
                </div>
                <p className="text-xs text-muted-foreground mb-1">Дозвон...</p>
                <p className="text-2xl font-mono font-semibold text-foreground">{currentCall.phone || '...'}</p>
                {currentCall.numberData && Object.keys(currentCall.numberData).length > 0 && (
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 mt-2">
                    {Object.entries(currentCall.numberData).map(([k, v]) => v ? (
                      <span key={k} className="text-xs text-muted-foreground">
                        <span className="opacity-60">{k}:</span> <span className="text-foreground/80 font-medium">{String(v)}</span>
                      </span>
                    ) : null)}
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-2">
                  Кампания: <span className="text-muted-foreground">{activeCampaign?.name}</span>
                </p>
              </div>
            </div>
          )}

          {/* Talking */}
          {status === 'TALKING' && currentCall && (
            <div className="flex-1 flex flex-col">
              {/* Call header */}
              <div className="bg-green-900/20 border-b border-green-500/20 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                    <User size={20} className="text-green-400" />
                  </div>
                  <div>
                    <p className="text-lg font-mono font-semibold text-foreground">{currentCall.phone}</p>
                    {currentCall.numberData && Object.keys(currentCall.numberData).length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        {Object.entries(currentCall.numberData).map(([k, v]) => v ? (
                          <span key={k} className="text-xs text-muted-foreground">
                            <span className="text-foreground/50">{k}:</span> <span className="text-foreground/80 font-medium">{String(v)}</span>
                          </span>
                        ) : null)}
                      </div>
                    )}
                    <p className="text-xs text-green-400 flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      В разговоре · {fmtTime(talkSec)}
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{activeCampaign?.name}</div>
                  {isMuted && <div className="text-red-400 mt-0.5 flex items-center gap-1 justify-end"><MicOff size={11} /> Muted</div>}
                </div>
              </div>

              {/* Form + Script */}
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6">
                  {activeForm ? (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">{activeForm.name}</p>
                      <OperatorForm form={activeForm} values={formValues} onChange={(k, v) => setFormValues(p => ({ ...p, [k]: v }))} resultLimits={resultLimits} resultCounts={resultCounts} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-32 border-2 border-dashed border-border rounded-xl text-muted-foreground text-sm">
                      Форма не привязана к кампании
                    </div>
                  )}
                </div>
                {activeScript && activeScript.steps.length > 0 && (
                  <ScriptPanel script={activeScript} step={scriptStep} onStep={setScriptStep} />
                )}
              </div>
            </div>
          )}

          {/* ACW */}
          {status === 'ACW' && (
            <div className="flex-1 flex flex-col">
              <div className="bg-orange-900/20 border-b border-orange-500/20 px-6 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center flex-shrink-0">
                    <User size={18} className="text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-orange-400">ACW</span>
                      {currentCall?.phone && (
                        <span className="text-base font-mono font-semibold text-foreground">{currentCall.phone}</span>
                      )}
                    </div>
                    {currentCall?.numberData && Object.keys(currentCall.numberData).length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-0 mt-0.5">
                        {Object.entries(currentCall.numberData).map(([k, v]) => v ? (
                          <span key={k} className="text-xs text-muted-foreground">
                            <span className="opacity-60">{k}:</span> <span className="text-foreground/80 font-medium">{String(v)}</span>
                          </span>
                        ) : null)}
                      </div>
                    )}
                    {!currentCall?.phone && (
                      <span className="text-xs text-muted-foreground">Заполните форму до завершения таймера</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className={`font-mono font-bold ${acwTimer !== null && acwTimer <= 10 ? 'text-red-400' : 'text-orange-400'}`}>
                    {acwTimer === null ? '∞' : fmtTime(acwTimer)}
                  </span>
                  {(() => {
                    // Disable "Сохранить и далее" until a RESULT field is filled
                    const resultField = activeForm?.fields?.find((f: any) => f.type === 'RESULT');
                    const hasResult = resultField
                      ? !!formValues[String((resultField as any).id)]
                      : true; // no RESULT field in form → always allowed
                    return (
                      <button
                        onClick={saveAndNext}
                        disabled={!hasResult}
                        title={!hasResult ? 'Выберите результат звонка' : undefined}
                        className="px-4 py-1.5 bg-primary hover:bg-[#6b84ff] rounded-lg text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary">
                        Сохранить и далее
                      </button>
                    );
                  })()}
                </div>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6">
                  {activeForm ? (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-4">{activeForm.name}</p>
                      <OperatorForm form={activeForm} values={formValues} onChange={(k, v) => setFormValues(p => ({ ...p, [k]: v }))} resultLimits={resultLimits} resultCounts={resultCounts} />
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground text-sm py-12">
                      <PhoneMissed size={32} className="mx-auto mb-3 opacity-40" />
                      Форма не настроена. Нажмите «Сохранить и далее».
                    </div>
                  )}
                </div>
                {activeScript && activeScript.steps.length > 0 && (
                  <ScriptPanel script={activeScript} step={scriptStep} onStep={setScriptStep} />
                )}
              </div>
            </div>
          )}

          </> /* end status-based content */}

        </div>

      </div>

      {/* ── Messages drawer ── */}
      {showMessages && (
        <div className="fixed top-14 right-0 z-40 w-80 h-[calc(100vh-56px)] bg-card border-l border-border flex flex-col shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Сообщения от супервизора</span>
            <button onClick={() => setShowMessages(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
            {allMessages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Нет сообщений</p>
            ) : allMessages.map((msg: any) => (
              <div key={msg.id} className={['rounded-xl p-3 border', msg.readAt ? 'bg-accent/30 border-border' : 'bg-primary/10 border-primary/30'].join(' ')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">{msg.fromName}</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(msg.sentAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-sm text-foreground">{msg.body}</p>
                {!msg.readAt && <div className="w-1.5 h-1.5 rounded-full bg-primary absolute top-2 right-2" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showPauseModal && (
        <PauseModal reasons={pauseReasonsList} onSelect={confirmPause} onClose={() => setShowPauseModal(false)} />
      )}

      {showCampaignPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-96 shadow-2xl">
            <h3 className="text-base font-semibold mb-4">Выберите кампанию</h3>
            {campaigns.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Нет активных кампаний</p>
            )}
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto mb-4">
              {campaigns.filter((c: Campaign) => c.status === 'ACTIVE' && c.dialMode !== 'MANUAL' && (!c.campaignTeams?.length || c.campaignTeams.some(ct => ct.team.id === (user as any).teamId))).map((c: Campaign) => (
                <button key={c.id} onClick={() => selectCampaign(c)}
                  className="flex items-center justify-between px-4 py-3 rounded-xl border border-border hover:border-primary hover:bg-accent transition-all text-left">
                  <div>
                    <div className="text-sm font-medium text-foreground">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.timeFrom}–{c.timeTo}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{c._count?.numbers ?? 0} номеров</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowCampaignPicker(false)}
              className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* ── Edit call modal ── */}
      {editCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div>
                <h3 className="text-base font-semibold">Редактировать результат</h3>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">{editCall.phone}</p>
              </div>
              <button onClick={() => setEditCall(null)} className="text-muted-foreground hover:text-foreground">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {activeForm ? (
                <OperatorForm
                  form={activeForm}
                  values={editFormValues}
                  onChange={(k, v) => setEditFormValues(p => ({ ...p, [k]: v }))}
                  resultLimits={resultLimits}
                  resultCounts={resultCounts}
                />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Форма не привязана к кампании</p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3 flex-shrink-0">
              <button
                onClick={() => setEditCall(null)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
              >
                Отмена
              </button>
              <button
                disabled={editSaving}
                onClick={async () => {
                  setEditSaving(true);
                  try {
                    // Extract result type from form values
                    const resultField = activeForm?.fields?.find((f: any) => f.type === 'RESULT');
                    const selectedLabel = resultField?.id != null ? (editFormValues[String(resultField.id)] || null) : null;
                    const resultType = selectedLabel
                      ? ((resultField?.config?.results ?? []) as any[]).find((r: any) => r.label === selectedLabel)?.type ?? null
                      : null;

                    const processedFormData: Record<string, any> = { ...editFormValues };
                    for (const [key, val] of Object.entries(editFormValues)) {
                      if (val && typeof val === 'object' && '__date' in val) {
                        processedFormData[key] = (val as any).__date;
                      }
                    }

                    await callsApi.updateFormData(editCall.id, {
                      result: resultType || undefined,
                      formData: Object.keys(processedFormData).length > 0 ? processedFormData : undefined,
                    });
                    setEditCall(null);
                    refetchCampaignCalls();
                    refetchTodayStats();
                  } catch {
                    // keep modal open on error
                  } finally {
                    setEditSaving(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-[#6b84ff] text-sm font-medium transition-colors disabled:opacity-50"
              >
                {editSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
