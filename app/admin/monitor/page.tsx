'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone, Coffee, Clock, Users, ChevronDown, ChevronRight,
  X, MessageSquare, Send, MoveRight, AlertCircle, RefreshCw,
} from 'lucide-react';
import { monitorApi, messagesApi, campaignsApi, type Campaign } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { io } from 'socket.io-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonitorOperator {
  id: number;
  name: string;
  extension?: string | null;
  onlineStatus: string;
  pauseReasonLabel?: string | null;
  pauseStartedAt?: string | null;
  statusSince: string;
  team?: { id: number; name: string } | null;
  callsToday: number;
  currentCall?: {
    phone: string;
    startedAt: string;
    answeredAt?: string | null;
    durationSec: number;
    direction?: string;
  } | null;
}

interface MonitorCampaign {
  id: number;
  name: string;
  status: string;
  totalNumbers: number;
  doneNumbers: number;
  callsToday: number;
  talkTimeTodaySec: number;
  operators: MonitorOperator[];
}

interface MonitorData {
  campaigns: MonitorCampaign[];
  unassigned: MonitorOperator[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSec(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtHm(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function sinceSeconds(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}

// Live timer that increments every second
function LiveTimer({ startSec, className }: { startSec: number; className?: string }) {
  const [sec, setSec] = useState(startSec);
  useEffect(() => {
    setSec(startSec);
    const id = setInterval(() => setSec(s => s + 1), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(startSec / 60)]);
  return <span className={className}>{fmtSec(sec)}</span>;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; row: string; badge: string }> = {
  TALKING: {
    label: 'Разговор',
    dot: 'bg-green-500 shadow-[0_0_6px_#22c55e] animate-pulse',
    row: 'border-l-2 border-green-500/50 bg-green-500/5',
    badge: 'text-green-400 bg-green-500/10 border border-green-500/20',
  },
  DIALING: {
    label: 'Дозвон',
    dot: 'bg-yellow-400 animate-pulse',
    row: 'border-l-2 border-yellow-500/50 bg-yellow-500/5',
    badge: 'text-yellow-400 bg-yellow-500/10 border border-yellow-500/20',
  },
  ACW: {
    label: 'ACW',
    dot: 'bg-orange-400 animate-pulse',
    row: 'border-l-2 border-orange-500/50 bg-orange-500/5',
    badge: 'text-orange-400 bg-orange-500/10 border border-orange-500/20',
  },
  PAUSE: {
    label: 'Пауза',
    dot: 'bg-red-400',
    row: 'border-l-2 border-red-500/50 bg-red-500/5',
    badge: 'text-red-400 bg-red-500/10 border border-red-500/20',
  },
  IDLE: {
    label: 'Ожидание',
    dot: 'bg-blue-400',
    row: 'border-l-2 border-blue-500/20 bg-transparent',
    badge: 'text-blue-400 bg-blue-500/10 border border-blue-500/20',
  },
  OFFLINE: {
    label: 'Офлайн',
    dot: 'bg-[#585870]',
    row: 'border-l-2 border-transparent opacity-50',
    badge: 'text-muted-foreground bg-accent border border-border',
  },
};

function getStatusCfg(s: string) {
  return STATUS_CFG[s] ?? STATUS_CFG.OFFLINE;
}

// ─── Message modal ────────────────────────────────────────────────────────────

function MessageModal({
  operators,
  preselected,
  onClose,
}: {
  operators: MonitorOperator[];
  preselected: number[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(preselected));
  const [body, setBody] = useState('');
  const qc = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(Array.from(selected).map(id => messagesApi.send(id, body)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitor'] });
      onClose();
    },
  });

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-[480px] shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Сообщение операторам</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {/* Operator selector */}
        <div className="mb-3">
          <p className="text-xs text-muted-foreground mb-2">Получатели:</p>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
            {operators.map(op => (
              <button
                key={op.id}
                onClick={() => toggle(op.id)}
                className={[
                  'px-2.5 py-1 rounded-full text-xs border transition-colors',
                  selected.has(op.id)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-accent text-muted-foreground border-border hover:border-primary',
                ].join(' ')}
              >
                {op.name}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Текст сообщения..."
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring resize-none h-24 mb-4"
        />

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            Отмена
          </button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={!body.trim() || selected.size === 0 || sendMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Send size={13} />
            {sendMutation.isPending ? 'Отправка...' : `Отправить (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Move to campaign modal ────────────────────────────────────────────────────

function MoveCampaignModal({
  operatorId,
  onClose,
}: {
  operatorId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: campaigns = [] } = useQuery<Campaign[]>({ queryKey: ['campaigns'], queryFn: campaignsApi.getAll });

  const moveMutation = useMutation({
    mutationFn: (campaignId: number) => monitorApi.moveToCampaign(operatorId, campaignId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitor'] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-6 w-80 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold">Переместить в кампанию</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-2">
          {(campaigns as Campaign[]).filter(c => c.status === 'ACTIVE').map(c => (
            <button key={c.id} onClick={() => moveMutation.mutate(c.id)}
              className="px-4 py-2.5 rounded-xl border border-border hover:border-primary hover:bg-accent transition-all text-left text-sm">
              {c.name}
            </button>
          ))}
          {campaigns.filter((c: Campaign) => c.status === 'ACTIVE').length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Нет активных кампаний</p>
          )}
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-all">
          Отмена
        </button>
      </div>
    </div>
  );
}

// ─── Operator row ──────────────────────────────────────────────────────────────

function OperatorRow({
  op,
  checked,
  onCheck,
  onMessage,
  onKick,
  onMove,
  onBreak,
  canManage,
}: {
  op: MonitorOperator;
  checked: boolean;
  onCheck: () => void;
  onMessage: () => void;
  onKick: () => void;
  onMove: () => void;
  onBreak: () => void;
  canManage: boolean;
}) {
  const cfg = getStatusCfg(op.onlineStatus);
  const [showActions, setShowActions] = useState(false);

  const callDuration = op.currentCall
    ? (op.currentCall.answeredAt
        ? sinceSeconds(op.currentCall.answeredAt)
        : sinceSeconds(op.currentCall.startedAt))
    : 0;

  const statusDuration = sinceSeconds(op.onlineStatus === 'PAUSE' ? op.pauseStartedAt : op.statusSince);

  return (
    <div className={['flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 mb-1 transition-colors relative group', cfg.row].join(' ')}>
      {/* Checkbox — only for users with MONITOR_MANAGE */}
      {canManage && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onCheck}
          className="accent-primary w-3.5 h-3.5 flex-shrink-0"
        />
      )}

      {/* Status dot */}
      <div className={['w-2 h-2 rounded-full flex-shrink-0', cfg.dot].join(' ')} />

      {/* Name + info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{op.name}</span>
          {op.extension && <span className="text-xs text-muted-foreground">({op.extension})</span>}
          <span className={['text-[10px] px-1.5 py-0.5 rounded-full font-medium', cfg.badge].join(' ')}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
          {/* Call info */}
          {op.onlineStatus === 'TALKING' && op.currentCall && (
            <span className={op.currentCall.direction === 'INBOUND' ? 'text-violet-400' : 'text-green-400'}>
              {op.currentCall.direction === 'INBOUND' ? '📲' : '📞'} {op.currentCall.phone} — <LiveTimer startSec={callDuration} />
              {op.currentCall.direction === 'INBOUND' && <span className="ml-1 text-[10px] opacity-70">вх.</span>}
            </span>
          )}
          {/* Pause info */}
          {op.onlineStatus === 'PAUSE' && (
            <span className="text-red-400">
              ☕ {op.pauseReasonLabel ?? 'Пауза'} — <LiveTimer startSec={statusDuration} />
            </span>
          )}
          {/* Idle time */}
          {op.onlineStatus === 'IDLE' && statusDuration > 60 && (
            <span>Ожидает <LiveTimer startSec={statusDuration} /></span>
          )}
          {/* Calls today */}
          <span>Звонков сегодня: {op.callsToday}</span>
        </div>
      </div>

      {/* Action buttons — only for users with MONITOR_MANAGE */}
      {canManage && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onMessage} title="Сообщение"
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <MessageSquare size={13} />
          </button>
          <button onClick={onMove} title="Переместить в кампанию"
            className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <MoveRight size={13} />
          </button>
          {op.onlineStatus !== 'PAUSE' && (
            <button onClick={onBreak} title="Поставить на паузу"
              className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <Coffee size={13} />
            </button>
          )}
          <button onClick={onKick} title="Снять с линии"
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Campaign section ─────────────────────────────────────────────────────────

function CampaignSection({
  campaign,
  checkedIds,
  onCheck,
  allOperators,
  onMessage,
  onKick,
  onMove,
  onBreak,
  canManage,
}: {
  campaign: MonitorCampaign;
  checkedIds: Set<number>;
  onCheck: (id: number) => void;
  allOperators: MonitorOperator[];
  onMessage: (ids: number[]) => void;
  onKick: (id: number) => void;
  onMove: (id: number) => void;
  onBreak: (id: number) => void;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(true);

  const visibleOps = campaign.operators.filter(o => o.onlineStatus !== 'OFFLINE');
  const talking   = campaign.operators.filter(o => o.onlineStatus === 'TALKING').length;
  const paused    = campaign.operators.filter(o => o.onlineStatus === 'PAUSE').length;
  const waiting   = campaign.operators.filter(o => o.onlineStatus === 'IDLE').length;
  const pct = campaign.totalNumbers > 0
    ? Math.round((campaign.doneNumbers / campaign.totalNumbers) * 100)
    : 0;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-3">
      {/* Campaign header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
      >
        <span className="text-muted-foreground">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="font-semibold text-sm text-foreground flex-1">{campaign.name}</span>

        {/* Stats strip */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="text-green-400 font-medium">{talking} 📞</span>
          <span className="text-red-400">{paused} ☕</span>
          <span className="text-blue-400">{waiting} ⏳</span>
          <span>|</span>
          <span>Разговоры: {fmtHm(campaign.talkTimeTodaySec)}</span>
          <span>Звонков: {campaign.callsToday}</span>
          <span>|</span>
          <div className="flex items-center gap-1.5">
            <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span>{campaign.doneNumbers}/{campaign.totalNumbers} ({pct}%)</span>
          </div>
        </div>

        <span className="w-2 h-2 rounded-full bg-green-500 ml-1" title="Активна" />
      </button>

      {/* Operators */}
      {open && (
        <div className="pb-2 border-t border-border/50">
          {visibleOps.length === 0 ? (
            <p className="text-xs text-muted-foreground px-6 py-3">Нет операторов на линии</p>
          ) : (
            visibleOps.map(op => (
              <OperatorRow
                key={op.id}
                op={op}
                checked={checkedIds.has(op.id)}
                onCheck={() => onCheck(op.id)}
                onMessage={() => onMessage([op.id])}
                onKick={() => onKick(op.id)}
                onMove={() => onMove(op.id)}
                onBreak={() => onBreak(op.id)}
                canManage={canManage}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const BREAK_TYPES = ['Перерыв', 'Обучение', 'Частная'];

export default function MonitorPage() {
  useRequirePermission('MONITOR_VIEW');
  const qc = useQueryClient();
  const { can } = useAuth();
  const canManage = can('MONITOR_MANAGE');
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [msgModal, setMsgModal] = useState<number[] | null>(null);     // operator ids for message
  const [moveModal, setMoveModal] = useState<number | null>(null);     // operator id
  const [breakTarget, setBreakTarget] = useState<number | null>(null); // operator id
  const [lastRefresh, setLastRefresh] = useState(Date.now());

  const { data, isLoading, error, dataUpdatedAt } = useQuery<MonitorData>({
    queryKey: ['monitor'],
    queryFn: monitorApi.getData,
    refetchInterval: 2_000,
    staleTime: 0,
  });

  // ── Real-time: invalidate monitor immediately when any operator changes status ──
  useEffect(() => {
    const backendBase = typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3001';
    const socket = io(`${backendBase}/ws`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socket.on('operator:status-changed', () => {
      qc.invalidateQueries({ queryKey: ['monitor'] });
    });
    return () => { socket.disconnect(); };
  }, [qc]);

  const kickMutation = useMutation({
    mutationFn: (id: number) => monitorApi.kick(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['monitor'] }),
  });

  const breakMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => monitorApi.setBreak(id, reason),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitor'] }); setBreakTarget(null); },
  });

  const allOperators: MonitorOperator[] = [
    ...(data?.campaigns.flatMap(c => c.operators) ?? []),
    ...(data?.unassigned ?? []),
  ];

  const toggleCheck = (id: number) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Stats summary
  const totalTalking = allOperators.filter(o => o.onlineStatus === 'TALKING').length;
  const totalPaused  = allOperators.filter(o => o.onlineStatus === 'PAUSE').length;
  const totalWaiting = allOperators.filter(o => o.onlineStatus === 'IDLE').length;
  const totalOffline = allOperators.filter(o => o.onlineStatus === 'OFFLINE').length;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Монитор</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Обновление каждые 4 сек
            {dataUpdatedAt ? ` · последнее ${new Date(dataUpdatedAt).toLocaleTimeString('ru')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && checkedIds.size > 0 && (
            <button
              onClick={() => setMsgModal(Array.from(checkedIds))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <MessageSquare size={12} />
              Групповое сообщение ({checkedIds.size})
            </button>
          )}
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['monitor'] })}
            className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" title="Live" />
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'В разговоре', val: totalTalking, color: 'text-green-400', dot: 'bg-green-400 shadow-[0_0_6px_#22c55e] animate-pulse' },
          { label: 'Ожидают',     val: totalWaiting, color: 'text-blue-400',  dot: 'bg-blue-400' },
          { label: 'На паузе',    val: totalPaused,  color: 'text-red-400',   dot: 'bg-red-400' },
          { label: 'Офлайн',      val: totalOffline, color: 'text-muted-foreground', dot: 'bg-[#585870]' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={['w-3 h-3 rounded-full flex-shrink-0', s.dot].join(' ')} />
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={['text-2xl font-bold', s.color].join(' ')}>{s.val}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Content ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Загрузка...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle size={16} />
          Ошибка загрузки данных монитора
        </div>
      )}

      {data && (
        <>
          {/* Campaign sections */}
          {data.campaigns.length === 0 && data.unassigned.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground">
              <Users className="mx-auto mb-3 opacity-30" size={32} />
              <p>Нет активных кампаний и операторов онлайн</p>
            </div>
          ) : (
            <>
              {data.campaigns.map(c => (
                <CampaignSection
                  key={c.id}
                  campaign={c}
                  checkedIds={checkedIds}
                  onCheck={toggleCheck}
                  allOperators={allOperators}
                  onMessage={ids => setMsgModal(ids)}
                  onKick={id => kickMutation.mutate(id)}
                  onMove={id => setMoveModal(id)}
                  onBreak={id => setBreakTarget(id)}
                  canManage={canManage}
                />
              ))}

              {/* Unassigned online operators (OFFLINE excluded) */}
              {data.unassigned.filter(o => o.onlineStatus !== 'OFFLINE').length > 0 && (
                <div className="bg-card border border-border rounded-xl overflow-hidden mb-3">
                  <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Без кампании ({data.unassigned.filter(o => o.onlineStatus !== 'OFFLINE').length})
                    </span>
                  </div>
                  <div className="pb-2">
                    {data.unassigned.filter(o => o.onlineStatus !== 'OFFLINE').map(op => (
                      <OperatorRow
                        key={op.id}
                        op={op}
                        checked={checkedIds.has(op.id)}
                        onCheck={() => toggleCheck(op.id)}
                        onMessage={() => setMsgModal([op.id])}
                        onKick={() => kickMutation.mutate(op.id)}
                        onMove={() => setMoveModal(op.id)}
                        onBreak={() => setBreakTarget(op.id)}
                        canManage={canManage}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Break type picker ── */}
      {breakTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-72 shadow-2xl">
            <h3 className="text-base font-semibold mb-4">Тип перерыва</h3>
            <div className="flex flex-col gap-2 mb-3">
              {BREAK_TYPES.map(bt => (
                <button key={bt} onClick={() => breakMutation.mutate({ id: breakTarget, reason: bt })}
                  disabled={breakMutation.isPending}
                  className="px-4 py-2.5 rounded-xl border border-border hover:border-primary hover:bg-accent transition-all text-sm text-left">
                  {bt}
                </button>
              ))}
            </div>
            <button onClick={() => setBreakTarget(null)}
              className="w-full py-2 rounded-xl border border-border text-sm text-muted-foreground hover:bg-accent transition-all">
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* ── Message modal ── */}
      {msgModal !== null && (
        <MessageModal
          operators={allOperators}
          preselected={msgModal}
          onClose={() => setMsgModal(null)}
        />
      )}

      {/* ── Move modal ── */}
      {moveModal !== null && (
        <MoveCampaignModal
          operatorId={moveModal}
          onClose={() => setMoveModal(null)}
        />
      )}
    </div>
  );
}
