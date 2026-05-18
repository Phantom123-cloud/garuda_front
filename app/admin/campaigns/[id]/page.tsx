'use client';
import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import {
  ArrowLeft, Plus, Trash2, Phone, RefreshCw, X, CheckCircle2,
  Upload, BarChart2, Download, FileCheck, Edit2, Save, PhoneCall,
  Clock, TrendingUp, Users, FileDown, PlayCircle, StopCircle,
  MoreHorizontal, Lock, Unlock, Circle, PhoneIncoming, List,
  FileText, Sheet,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { DropdownContent, DropdownItem, DropdownSeparator } from '@/components/ui/row-menu';
import {
  campaignsApi, numbersApi, callsApi, formsApi, providersApi, teamsApi, scriptsApi,
  dialerApi, importLogsApi,
  type Campaign, type PhoneEntry, type Form,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';

// ── CSV helpers ────────────────────────────────────────────────────────────────
function detectDelim(line: string): string {
  return (line.match(/;/g) ?? []).length > (line.match(/,/g) ?? []).length ? ';' : ',';
}

/** Valid phone: digits, +, spaces, dashes, parens only — at least 7 digits */
function isValidPhone(s: string): boolean {
  return /^\+?[\d\s\-()+]{7,}$/.test(s) && (s.match(/\d/g) ?? []).length >= 7;
}

function parseCsv(text: string): PhoneEntry[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delim = detectDelim(lines[0]);
  const first = lines[0].split(delim).map(h => h.trim());
  // Header if first cell doesn't look like a phone number
  const hasHeader = !isValidPhone(first[0]);
  if (!hasHeader) {
    return lines
      .map(l => ({ phone: l.split(delim)[0].trim() }))
      .filter(e => isValidPhone(e.phone));
  }
  const headers = first;
  const pIdx = Math.max(0, headers.findIndex(h => /phone|телефон|номер|number/i.test(h)));
  const dataHdrs = headers.filter((_, i) => i !== pIdx && headers[i].trim() !== '');
  return lines.slice(1).map(line => {
    const cells = line.split(delim).map(c => c.trim());
    const phone = cells[pIdx] ?? '';
    if (!isValidPhone(phone)) return null;
    // Always save all header keys — even if values are empty, so export always shows columns
    if (dataHdrs.length > 0) {
      const data: Record<string, string> = {};
      dataHdrs.forEach(h => { const ci = headers.indexOf(h); data[h] = cells[ci]?.trim() ?? ''; });
      return { phone, data };
    }
    return { phone };
  }).filter(Boolean) as PhoneEntry[];
}

/** Parse a plain text/CSV file for phones (one per line or column A) */
function parsePhonesFromText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(l => { const d = detectDelim(l); return l.split(d)[0].trim(); })
    .filter(p => isValidPhone(p));
}

function downloadCsv(filename: string, rows: string[][], headers: string[]) {
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadPhonesCsv(filename: string, phones: string[]) {
  downloadCsv(filename, phones.map(p => [p]), ['phone']);
}

function downloadTemplate(fields: { label: string }[]) {
  const labels = fields.filter(f => f.label).map(f => f.label);
  downloadCsv('template.csv', [], ['phone', ...labels]);
}

function fmtDuration(sec: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Phone history modal ───────────────────────────────────────────────────────
const RESULT_LABELS: Record<string, string> = {
  MISSED: 'Недозвон', VOICEMAIL: 'Автоответчик', REFUSE: 'Отказ', AGREE: 'Согласие', CALLBACK: 'Перезвон',
};

function PhoneHistoryModal({ campaignId, dialResult, onClose }: { campaignId: number; dialResult: string; onClose: () => void }) {
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useQuery<any[]>({
    queryKey: ['phone-history', campaignId, dialResult],
    queryFn: () => numbersApi.exportNumbers(campaignId, dialResult),
  });

  const filtered = search.trim()
    ? rows.filter((r: any) => r.phone?.includes(search.trim()))
    : rows;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h3 className="font-semibold text-base">
              {DIAL_STATUS_CFG[dialResult]?.label ?? dialResult}
            </h3>
            {!isLoading && (
              <p className="text-xs text-muted-foreground mt-0.5">{rows.length} номеров</p>
            )}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X size={16} /></button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border/50 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по номеру..."
            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {isLoading && (
            <p className="text-sm text-muted-foreground p-6 text-center">Загрузка...</p>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground p-8 text-center">Нет номеров</p>
          )}
          {filtered.map((r: any) => (
            <div key={r.id ?? r.phone} className="flex items-center gap-3 px-5 py-2.5 border-b border-border/40 hover:bg-accent/30 transition-colors">
              <span className="font-mono text-sm text-foreground flex-1">{r.phone}</span>
              <span className="text-xs text-muted-foreground">
                {r.attempts ?? 0} {(r.attempts ?? 0) === 1 ? 'попытка' : 'попыток'}
              </span>
              {r.lastResult && r.lastResult !== 'MISSED' && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">
                  {RESULT_LABELS[r.lastResult] ?? r.lastResult}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-5 py-2.5 border-t border-border/50 flex-shrink-0 text-xs text-muted-foreground">
            {search ? `${filtered.length} из ${rows.length}` : `${rows.length} номеров`}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────
const RESULT_CFG: Record<string, { label: string; color: string; bg: string; bar: string }> = {
  MISSED:    { label: 'Недозвон',     color: 'text-muted-foreground', bg: 'bg-muted/60',        bar: 'bg-muted' },
  VOICEMAIL: { label: 'Автоответчик', color: 'text-yellow-400',       bg: 'bg-yellow-500/10',   bar: 'bg-yellow-400' },
  REFUSE:    { label: 'Отказ',        color: 'text-red-400',          bg: 'bg-red-500/10',      bar: 'bg-red-400' },
  AGREE:     { label: 'Согласие',     color: 'text-green-400',        bg: 'bg-green-500/10',    bar: 'bg-green-400' },
  CALLBACK:  { label: 'Перезвон',     color: 'text-blue-400',         bg: 'bg-blue-500/10',     bar: 'bg-blue-400' },
};

const DIAL_STATUS_CFG: Record<string, { label: string; dotColor: string; color: string; bg: string }> = {
  ACTIVE:        { label: 'Активный',             dotColor: 'bg-gray-400',    color: 'text-gray-400',    bg: 'bg-gray-500/10' },
  PENDING_ACW:   { label: 'Несохранённый',        dotColor: 'bg-amber-400',   color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  ERROR:         { label: 'Ошибка',               dotColor: 'bg-yellow-400',  color: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
  INTERRUPTED:   { label: 'Прервано',             dotColor: 'bg-yellow-400',  color: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
  BUSY:          { label: 'Занят',                dotColor: 'bg-orange-400',  color: 'text-orange-400',  bg: 'bg-orange-500/10' },
  NO_ANSWER:     { label: 'Нет ответа',           dotColor: 'bg-gray-400',    color: 'text-gray-400',    bg: 'bg-gray-500/10' },
  ANSWERED:      { label: 'Отвечено',             dotColor: 'bg-green-400',   color: 'text-green-400',   bg: 'bg-green-500/10' },
  INVALID:       { label: 'Некорректный номер',   dotColor: 'bg-red-400',     color: 'text-red-400',     bg: 'bg-red-500/10' },
  REJECTED:      { label: 'Отклонено',            dotColor: 'bg-red-400',     color: 'text-red-400',     bg: 'bg-red-500/10' },
  ERROR_CREATE:  { label: 'Ошибка создания',      dotColor: 'bg-red-400',     color: 'text-red-400',     bg: 'bg-red-500/10' },
  CANCELLED:     { label: 'Отменено',             dotColor: 'bg-gray-400',    color: 'text-gray-400',    bg: 'bg-gray-500/10' },
  BLACKLISTED:   { label: 'Чёрный список',        dotColor: 'bg-purple-500',  color: 'text-purple-400',  bg: 'bg-purple-500/10' },
};

// Fixed ordered list of all dial statuses (always shown, even if 0)
const DIAL_STATUS_ORDER = ['ACTIVE','PENDING_ACW','ERROR','INTERRUPTED','BUSY','NO_ANSWER','ANSWERED','INVALID','REJECTED','ERROR_CREATE','CANCELLED','BLACKLISTED'];

// Q.850 cause code → full info
interface CauseInfo { label: string; code: string; description: string; sip: string; }
const CAUSE_INFO: Record<number, CauseInfo> = {
  0:   { label: 'Отмена системой',           code: 'CANCEL',             description: 'Звонок отменён системой до ответа абонента.',                              sip: '487 Request Terminated' },
  1:   { label: 'Номер не существует',        code: 'UNALLOCATED',        description: 'Номер не выделен или не существует в сети оператора.',                    sip: '404 Not Found' },
  3:   { label: 'Нет маршрута к номеру',      code: 'NO_ROUTE',           description: 'Невозможно построить маршрут до указанного номера.',                      sip: '404 Not Found / 503 Service Unavailable' },
  16:  { label: 'Нормальное завершение',      code: 'NORMAL_CLEARING',    description: 'Звонок завершён в штатном режиме одной из сторон.',                       sip: '200 OK / BYE' },
  17:  { label: 'Абонент занят',              code: 'USER_BUSY',          description: 'Линия абонента занята — звонок не принят.',                               sip: '486 Busy Here' },
  18:  { label: 'Нет ответа (таймаут сети)',  code: 'NO_RESPONSE',        description: 'Абонент не ответил — звонок не дошёл до телефона (сетевой таймаут).',     sip: '408 Request Timeout' },
  19:  { label: 'Нет ответа пользователя',   code: 'NO_ANSWER',          description: 'Телефон звонил, но пользователь не снял трубку в течение таймаута.',      sip: '480 Temporarily Unavailable' },
  20:  { label: 'Абонент недоступен',         code: 'SUBSCRIBER_ABSENT',  description: 'Абонент временно недоступен: телефон выключен или вне зоны покрытия.',    sip: '480 Temporarily Unavailable' },
  21:  { label: 'Звонок отклонён',            code: 'CALL_REJECTED',      description: 'Абонент явно отклонил входящий вызов.',                                   sip: '403 Forbidden / 603 Decline' },
  22:  { label: 'Номер изменён',              code: 'NUMBER_CHANGED',     description: 'Номер изменён или перенесён к другому оператору.',                        sip: '301 Moved Permanently' },
  26:  { label: 'Сброс абонентом',            code: 'NON_SELECTED',       description: 'Абонент сбросил вызов до соединения.',                                    sip: '487 Request Terminated' },
  27:  { label: 'Пункт назначения недоступен',code: 'DEST_UNAVAILABLE',   description: 'Конечная точка маршрута недоступна.',                                     sip: '502 Bad Gateway' },
  28:  { label: 'Неверный формат номера',     code: 'INVALID_NUMBER',     description: 'Номер набран в неверном формате или содержит недопустимые символы.',      sip: '484 Address Incomplete' },
  34:  { label: 'Нет свободных каналов',      code: 'NO_CIRCUIT',         description: 'Все исходящие каналы заняты — попробуйте позже.',                         sip: '503 Service Unavailable' },
  38:  { label: 'Сеть недоступна',            code: 'NETWORK_DOWN',       description: 'Сеть оператора временно недоступна.',                                     sip: '503 Service Unavailable' },
  41:  { label: 'Временный сбой сети',        code: 'TEMP_FAILURE',       description: 'Временная техническая проблема в сети оператора.',                        sip: '503 Service Unavailable' },
  42:  { label: 'Перегрузка коммутатора',     code: 'CONGESTION',         description: 'Коммутационное оборудование перегружено.',                                sip: '503 Service Unavailable' },
  44:  { label: 'Канал недоступен',           code: 'CHANNEL_UNAVAIL',    description: 'Запрошенный канал временно недоступен.',                                  sip: '503 Service Unavailable' },
  47:  { label: 'Ресурс недоступен',          code: 'RESOURCE_UNAVAIL',   description: 'Необходимые сетевые ресурсы временно недоступны.',                        sip: '503 Service Unavailable' },
  58:  { label: 'Несовместимый Bearer',       code: 'BEARER_UNAVAIL',     description: 'Запрошенный тип соединения (Bearer) временно недоступен.',                sip: '488 Not Acceptable Here' },
  79:  { label: 'Сервис не реализован',       code: 'NOT_IMPLEMENTED',    description: 'Запрошенный сервис не поддерживается.',                                   sip: '501 Not Implemented' },
  88:  { label: 'Несовместимый тип вызова',   code: 'INCOMPATIBLE_DEST',  description: 'Параметры вызова несовместимы с возможностями абонента.',                 sip: '488 Not Acceptable Here' },
  102: { label: 'Истёк таймер',               code: 'RECOVERY_ON_TIMER',  description: 'Восстановление после истечения внутреннего таймера.',                    sip: '408 Request Timeout' },
  127: { label: 'Ошибка протокола',           code: 'INTERWORKING',       description: 'Неизвестная ошибка межсетевого взаимодействия.',                          sip: '500 Server Internal Error' },
  603: { label: 'SIP Decline',                code: 'SIP_DECLINE',        description: 'Абонент или сервер явно отклонил вызов.',                                 sip: '603 Decline' },
};
const getCauseInfo = (cause: number): CauseInfo =>
  cause === -1
    ? { label: 'Прочие', code: 'OTHER', description: 'Номера без определённого кода завершения.', sip: '—' }
    : CAUSE_INFO[cause] ?? { label: `Причина ${cause}`, code: `Q850_${cause}`, description: 'Неизвестный код завершения.', sip: '—' };

// Predefined cause codes shown as template rows for each dialResult (even with 0 count)
const DIALRESULT_CAUSE_TEMPLATE: Record<string, number[]> = {
  NO_ANSWER:   [19, 18, 20, 3],         // Нет ответа пользователя, таймаут сети, недоступен, нет маршрута
  BUSY:        [17],                     // Абонент занят
  CANCELLED:   [0, 26, 21],             // Отмена системой, Сброс абонентом, Отклонено
  REJECTED:    [21, 17],                // Отклонено, Занят
  INVALID:     [1, 3, 28, 88],          // Не существует, Нет маршрута, Неверный формат, Несовместимый
  ERROR:       [34, 38, 41, 42, 47, 58],// Нет каналов, Сеть, Временный сбой, Перегрузка, Ресурс, Bearer
  ERROR_CREATE:[34, 38, 41],            // Нет каналов, Сеть, Временный сбой
  INTERRUPTED: [26],                    // Сброс абонентом
  // ANSWERED — no cause breakdown, shown as single "Отвечено" row
};

const DIAL_OPTS = [
  { value: 'PREDICTIVE',  label: 'Предиктив',  desc: 'На стадии доработки', disabled: true },
  { value: 'PROGRESSIVE', label: 'Прогрессив', desc: 'Набор после готовности оператора' },
];

const ACW_TIMEOUT_OPTS = [
  { value: '',    label: 'Без ограничений' },
  { value: '10',  label: '10 секунд' },
  { value: '20',  label: '20 секунд' },
  { value: '30',  label: '30 секунд' },
  { value: '40',  label: '40 секунд' },
  { value: '50',  label: '50 секунд' },
  { value: '60',  label: '1 минута' },
  { value: '120', label: '2 минуты' },
  { value: '300', label: '5 минут' },
];

type Tab = 'numbers' | 'edit' | 'stats';
type EditSubTab = 'settings' | 'limits';

const BILLING_PAGE = 50;

// ── Pie chart ─────────────────────────────────────────────────────────────────
function StatsPieChart({ title, slices, emptyText }: {
  title: string;
  slices: { label: string; value: number; color: string }[];
  emptyText: string;
}) {
  const total = slices.reduce((s, r) => s + r.value, 0);
  const SIZE = 220;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const R = 88; // outer radius
  const r = 46; // inner radius (donut hole)

  // Build SVG arc paths
  const paths: { d: string; color: string; label: string; value: number; pct: number }[] = [];
  let cumAngle = -Math.PI / 2; // start at 12 o'clock
  for (const sl of slices) {
    const sweep = total > 0 ? (sl.value / total) * 2 * Math.PI : 0;
    const startA = cumAngle;
    const endA   = cumAngle + sweep;
    const large  = sweep > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(startA);
    const y1 = cy + R * Math.sin(startA);
    const x2 = cx + R * Math.cos(endA);
    const y2 = cy + R * Math.sin(endA);
    const xi1 = cx + r * Math.cos(startA);
    const yi1 = cy + r * Math.sin(startA);
    const xi2 = cx + r * Math.cos(endA);
    const yi2 = cy + r * Math.sin(endA);
    const pct = total > 0 ? Math.round((sl.value / total) * 100) : 0;
    if (sweep > 0) {
      paths.push({
        d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`,
        color: sl.color,
        label: sl.label,
        value: sl.value,
        pct,
      });
    }
    cumAngle = endA;
  }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      {slices.length === 0 || total === 0 ? (
        <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-8">
          {/* SVG donut */}
          <div className="flex-shrink-0">
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              {paths.map((p, i) => (
                <path key={i} d={p.d} fill={p.color} stroke="hsl(var(--card))" strokeWidth="2" />
              ))}
              {/* Center label */}
              <text x={cx} y={cy - 8} textAnchor="middle" fill="hsl(var(--foreground))" fontSize="22" fontWeight="700">{total}</text>
              <text x={cx} y={cy + 12} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="11">всего</text>
            </svg>
          </div>
          {/* Legend */}
          <div className="flex flex-col gap-2 flex-1 min-w-0 pt-1">
            {paths.map((p, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: p.color }} />
                <span className="text-xs text-foreground flex-1 truncate">{p.label}</span>
                <span className="text-xs font-semibold text-foreground font-mono w-10 text-right">{p.value}</span>
                <span className="text-[11px] text-muted-foreground w-9 text-right">{p.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CampaignDetailPage() {
  useRequirePermission('CAMPAIGNS_MANAGE');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const campaignId = Number(id);

  const [tab, setTab] = useState<Tab>('numbers');
  const [editSubTab, setEditSubTab] = useState<EditSubTab>('settings');
  const [phoneHistoryDialResult, setPhoneHistoryDialResult] = useState<string | null>(null);
  const [billingDir, setBillingDir] = useState<'ALL' | 'OUTBOUND' | 'INBOUND'>('ALL');
  const [addModal, setAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'text' | 'csv'>('text');
  const [bulkText, setBulkText] = useState('');
  const [csvEntries, setCsvEntries] = useState<PhoneEntry[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete by file modal state
  const [deleteModal, setDeleteModal] = useState(false);
  const [deletePhones, setDeletePhones] = useState<string[]>([]);
  const [deleteFileName, setDeleteFileName] = useState('');
  const deleteFileRef = useRef<HTMLInputElement>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: dialerStatus, refetch: refetchDialer } = useQuery({
    queryKey: ['dialer-status', campaignId],
    queryFn: () => dialerApi.status(campaignId),
    refetchInterval: 5_000,
  });

  const { data: campaign, isLoading: loadingCampaign } = useQuery<Campaign>({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.getOne(campaignId),
  });

  const { data: nd, isLoading: loadingNums, refetch: refetchNums } = useQuery<any>({
    queryKey: ['numbers', campaignId],
    queryFn: () => numbersApi.getByCampaign(campaignId),
    refetchInterval: 15_000,
  });

  const { data: numStats, refetch: refetchStats } = useQuery<any>({
    queryKey: ['number-stats', campaignId],
    queryFn: () => numbersApi.getStats(campaignId),
    enabled: true,
    refetchInterval: 15_000,
  });

  const { data: importLogs = [] } = useQuery<any[]>({
    queryKey: ['import-logs', campaignId],
    queryFn: () => importLogsApi.getAll(campaignId),
    staleTime: Infinity, // permanent — once imported, always locked
  });
  const formLocked = (importLogs as any[]).some(l => l.type === 'import');

  const { data: campStats } = useQuery<any>({
    queryKey: ['campaign-stats', campaignId],
    queryFn: () => callsApi.getCampaignStats(campaignId),
    enabled: tab === 'stats',
    refetchInterval: 30_000,
  });

  const { data: billingTotal = 0 } = useQuery<number>({
    queryKey: ['billing-count', campaignId],
    queryFn: () => callsApi.count({ campaignId }),
    refetchInterval: 30_000,
  });

  const { data: formData } = useQuery({
    queryKey: ['form', campaign?.form?.id],
    queryFn: () => formsApi.getOne(campaign!.form!.id),
    enabled: !!campaign?.form?.id,
  });
  const templateFields: { label: string }[] = (formData as any)?.fields?.filter((f: any) => f.label && f.type !== 'RESULT') ?? [];

  // Extract result options from attached form
  const formResultOptions: { type: string; label: string }[] = (() => {
    if (!formData) return [];
    const resultField = (formData as any)?.fields?.find((f: any) => f.type === 'RESULT');
    return resultField?.config?.results ?? [];
  })();

  // Result counts for this campaign (for "Сделано" display)
  const { data: resultCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['result-counts', campaignId],
    queryFn: () => campaignsApi.getResultCounts(campaignId),
    enabled: tab === 'edit',
    refetchInterval: tab === 'edit' ? 15_000 : false,
  });

  // Edit form state
  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: providersApi.getAll, enabled: tab === 'edit' });
  const { data: forms = [] } = useQuery<Form[]>({ queryKey: ['forms'], queryFn: formsApi.getAll, enabled: tab === 'edit' });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.getAll, enabled: tab === 'edit' });
  const { data: scripts = [] } = useQuery({ queryKey: ['scripts'], queryFn: scriptsApi.getAll, enabled: tab === 'edit' });

  const [editForm, setEditForm] = useState<any>(null);

  const openEdit = () => {
    if (!campaign) return;
    setEditForm({
      name: campaign.name,
      dialMode: campaign.dialMode,
      dialOverheadPct: (campaign as any).dialOverheadPct ?? 20,
      dialTimeout: (campaign as any).dialTimeout ?? 25,
      maxAbandoned: (campaign as any).maxAbandoned ?? 3,
      maxAttempts: campaign.maxAttempts ?? 3,
      retryInterval: campaign.retryInterval ?? 60,
      timeFrom: campaign.timeFrom,
      timeTo: campaign.timeTo,
      providerId: campaign.provider?.id ? String(campaign.provider.id) : '',
      formId: campaign.form?.id ? String(campaign.form.id) : '',
      scriptId: campaign.script?.id ? String(campaign.script.id) : '',
      teamIds: campaign.campaignTeams?.map((ct: any) => ct.team.id) ?? [],
      forcedConnection: campaign.forcedConnection ?? false,
      allowInbound: (campaign as any).allowInbound ?? false,
      isGeneralInbound: (campaign as any).isGeneralInbound ?? false,
      retryMissed: (campaign as any).retryMissed ?? false,
      resultLimits: ((campaign as any).resultLimits ?? {}) as Record<string, number>,
      acwTimeout: campaign.acwTimeout != null ? String(campaign.acwTimeout) : '',
    });
    setTab('edit');
  };

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveCampaign = useMutation({
    mutationFn: () => campaignsApi.update(campaignId, {
      ...editForm,
      dialOverheadPct: Number(editForm.dialOverheadPct),
      dialTimeout:     Number(editForm.dialTimeout),
      maxAbandoned:    Number(editForm.maxAbandoned),
      maxAttempts:     Number(editForm.maxAttempts),
      retryInterval:   Number(editForm.retryInterval),
      providerId:      editForm.providerId ? Number(editForm.providerId) : null,
      formId:          editForm.formId     ? Number(editForm.formId)     : null,
      scriptId:        editForm.scriptId   ? Number(editForm.scriptId)   : null,
      forcedConnection:  editForm.forcedConnection ?? false,
      allowInbound:      editForm.allowInbound ?? false,
      isGeneralInbound:  editForm.isGeneralInbound ?? false,
      retryMissed:       editForm.retryMissed ?? true,
      resultLimits:    editForm.resultLimits ?? null,
      acwTimeout:      editForm.acwTimeout ? Number(editForm.acwTimeout) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast('Кампания сохранена', 'success');
      setTab('numbers');
    },
    onError: () => toast('Ошибка при сохранении', 'error'),
  });

  const addNumbers = useMutation({
    mutationFn: () => {
      const initiator = user?.name ?? undefined;
      if (addTab === 'csv' && csvEntries.length > 0)
        return numbersApi.addWithData(campaignId, csvEntries, { filename: csvFileName, initiator });
      const phones = bulkText.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
      return numbersApi.add(campaignId, phones, { initiator });
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['numbers', campaignId] });
      qc.invalidateQueries({ queryKey: ['number-stats', campaignId] });
      qc.invalidateQueries({ queryKey: ['import-logs', campaignId] });
      const parts = [`Добавлено: ${data.added}`, `Дублей: ${data.skipped ?? 0}`];
      if (data.blacklisted > 0) parts.push(`В чёрном списке: ${data.blacklisted}`);
      toast(parts.join('. '), 'success');
      setAddModal(false); setBulkText(''); setCsvEntries([]); setCsvFileName('');
    },
    onError: () => toast('Ошибка при добавлении', 'error'),
  });

  const removeNumber = useMutation({
    mutationFn: (nid: number) => numbersApi.remove(nid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['numbers', campaignId] });
      qc.invalidateQueries({ queryKey: ['number-stats', campaignId] });
    },
  });

  const clearAll = useMutation({
    mutationFn: () => numbersApi.clear(campaignId),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['numbers', campaignId] });
      qc.invalidateQueries({ queryKey: ['number-stats', campaignId] });
      toast(`Удалено ${data.deleted} номеров`, 'success');
    },
  });

  const startDialer = useMutation({
    mutationFn: async () => {
      await campaignsApi.setStatus(campaignId, 'ACTIVE');
      await dialerApi.start(campaignId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      toast('Обзвон запущен', 'success');
      refetchDialer();
    },
    onError: () => toast('Ошибка запуска обзвона', 'error'),
  });

  const stopDialer = useMutation({
    mutationFn: async () => {
      await dialerApi.stop(campaignId);
      await campaignsApi.setStatus(campaignId, 'STOPPED');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaign', campaignId] });
      toast('Обзвон остановлен', 'success');
      refetchDialer();
    },
    onError: () => toast('Ошибка остановки', 'error'),
  });

  const blockCampaign = useMutation({
    mutationFn: async () => {
      await dialerApi.stop(campaignId);
      await campaignsApi.setStatus(campaignId, 'BLOCKED');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', campaignId] }); toast('Кампания заблокирована', 'success'); },
    onError: () => toast('Ошибка', 'error'),
  });

  const unblockCampaign = useMutation({
    mutationFn: () => campaignsApi.setStatus(campaignId, 'STOPPED'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', campaignId] }); toast('Кампания разблокирована', 'success'); },
    onError: () => toast('Ошибка', 'error'),
  });

  const removeCampaign = useMutation({
    mutationFn: () => campaignsApi.remove(campaignId),
    onSuccess: () => { toast('Кампания удалена', 'success'); router.push('/admin/campaigns'); },
    onError: () => toast('Ошибка удаления', 'error'),
  });

  const retryDialResult = useMutation({
    mutationFn: (dialResult: string | null) => numbersApi.resetByDialResult(campaignId, dialResult),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['number-stats', campaignId] });
      qc.invalidateQueries({ queryKey: ['numbers', campaignId] });
      toast(`Сброшено ${data.reset} номеров`, 'success');
    },
    onError: () => toast('Ошибка сброса', 'error'),
  });

  const retryAgentResult = useMutation({
    mutationFn: ({ type, label }: { type: string | null; label: string | null }) =>
      numbersApi.resetByAgentResult(campaignId, type, label),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['number-stats', campaignId] });
      qc.invalidateQueries({ queryKey: ['numbers', campaignId] });
      toast(`Сброшено ${data.reset} номеров`, 'success');
    },
    onError: () => toast('Ошибка сброса', 'error'),
  });

  const deleteBulk = useMutation({
    mutationFn: () => numbersApi.deleteBulk(campaignId, deletePhones, { filename: deleteFileName }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['numbers', campaignId] });
      qc.invalidateQueries({ queryKey: ['number-stats', campaignId] });
      toast(`Удалено ${data.deleted} номеров`, 'success');
      setDeleteModal(false);
      setDeletePhones([]);
      setDeleteFileName('');
    },
    onError: () => toast('Ошибка удаления', 'error'),
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;

      // ── Header validation against template ──────────────────────────────
      if (templateFields.length > 0) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          const delim = detectDelim(lines[0]);
          const firstCells = lines[0].split(delim).map(h => h.trim());
          const hasHeader = !isValidPhone(firstCells[0]);
          if (hasHeader) {
            const pIdx = Math.max(0, firstCells.findIndex(h => /phone|телефон|номер|number/i.test(h)));
            const fileDataHdrs = firstCells.filter((_, i) => i !== pIdx && firstCells[i].trim() !== '');
            const tplHdrs = templateFields.map(f => f.label);
            const missing = tplHdrs.filter(l => !fileDataHdrs.includes(l));
            const extra = fileDataHdrs.filter(l => !tplHdrs.includes(l));
            if (missing.length > 0 || extra.length > 0) {
              const msg = [
                missing.length ? `Не хватает: ${missing.join(', ')}` : '',
                extra.length ? `Лишние: ${extra.join(', ')}` : '',
              ].filter(Boolean).join(' | ');
              toast(`Заголовки не совпадают с шаблоном. ${msg}`, 'error');
              if (fileInputRef.current) fileInputRef.current.value = '';
              return;
            }
          }
        }
      }

      setCsvFileName(file.name);
      setCsvEntries(parseCsv(text));
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDeleteFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDeleteFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setDeletePhones(parsePhonesFromText(ev.target?.result as string));
    reader.readAsText(file, 'UTF-8');
  };

  const toggleTeam = (id: number) =>
    setEditForm((p: any) => ({ ...p, teamIds: p.teamIds.includes(id) ? p.teamIds.filter((t: number) => t !== id) : [...p.teamIds, id] }));

  const downloadBillingCsv = async () => {
    try {
      let rows: any[] = await callsApi.exportBilling(campaignId);
      if (billingDir !== 'ALL') rows = rows.filter((r: any) => (r.direction ?? 'OUTBOUND') === billingDir);
      if (rows.length === 0) { toast('Нет данных для экспорта', 'error'); return; }

      const dataKeys = Array.from(new Set(rows.flatMap((r: any) => Object.keys(r.data ?? {}))))
        .filter((k: string) => k.trim() !== '' && !/^\+?\d[\d\s\-\(\)]{7,}$/.test(k.trim()));
      const headers = [
        'Тип', 'Телефон', ...dataKeys,
        'Оператор', 'Код причины',
        'Начало', 'Ответ', 'Конец', 'Длительность (сек)', 'Результат агента',
      ];
      const csvRows = rows.map((r: any) => [
        r.direction === 'INBOUND' ? 'Входящий' : 'Исходящий',
        r.phone,
        ...dataKeys.map((k: string) => r.data?.[k] ?? ''),
        r.operator ?? '—',
        r.cause !== '' && r.cause != null ? String(r.cause) : '—',
        fmtIso(r.startedAt),
        r.answeredAt ? fmtIso(r.answeredAt) : '—',
        fmtIso(r.endedAt),
        r.duration !== '' && r.duration != null ? String(r.duration) : '—',
        r.agentResultLabel || (r.agentResult ? (RESULT_CFG[r.agentResult]?.label ?? r.agentResult) : '—'),
      ]);
      downloadCsv(`billing_${campaign?.name ?? campaignId}.csv`, csvRows, headers);
      toast(`Биллинг экспортирован (${rows.length} звонков)`, 'success');
    } catch { toast('Ошибка экспорта', 'error'); }
  };

  const fmtIso = (iso: string) => iso
    ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const buildExportCsv = (rows: any[], filename: string) => {
    // Collect all unique data keys (form fields) from all rows.
    // If template fields are known — keep only those (reliable filter).
    // Fallback: remove obvious garbage keys (phone numbers, etc.).
    const validTplKeys = templateFields.map(f => f.label);
    const dataKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r.data ?? {}))))
      .filter(k => {
        const t = k.trim();
        if (!t) return false;
        if (validTplKeys.length > 0) return validTplKeys.includes(t);
        // Fallback when no template: drop phone-like keys
        if (/^\+?[\d\s\-\(\)]{7,}$/.test(t)) return false;
        return true;
      })
      // Preserve template column order
      .sort((a, b) => {
        const ai = validTplKeys.indexOf(a), bi = validTplKeys.indexOf(b);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    const headers = [
      'Телефон', ...dataKeys,
      'Кол-во наборов', 'Статус набора', 'Код ошибки', 'Оператор',
      'Начало', 'Конец', 'Длительность (сек)', 'Результат агента',
    ];
    const csvRows = rows.map(r => [
      r.phone,
      ...dataKeys.map(k => r.data?.[k] ?? ''),
      r.attempts != null ? String(r.attempts) : '0',
      (['ANSWERED', 'PENDING_ACW', 'ACTIVE', 'BLACKLISTED'].includes(r.dialResult))
        ? (DIAL_STATUS_CFG[r.dialResult]?.label ?? r.dialResult)
        : r.causeCode != null
          ? getCauseInfo(r.causeCode).label
          : 'Прочие',
      r.causeCode != null ? String(r.causeCode) : '—',
      r.operator ?? '—',
      fmtIso(r.startedAt),
      fmtIso(r.endedAt),
      r.duration !== '' && r.duration != null ? String(r.duration) : '—',
      r.agentResultLabel || '—',
    ]);
    downloadCsv(filename, csvRows, headers);
  };

  const downloadDialResult = async (dialResult: string) => {
    try {
      const rows: any[] = await numbersApi.exportNumbers(campaignId, dialResult);
      buildExportCsv(rows, `${dialResult}_${campaign?.name ?? campaignId}.csv`);
      toast(`Скачано ${rows.length} номеров`, 'success');
    } catch { toast('Ошибка скачивания', 'error'); }
  };

  const downloadAgentResult = async (result: string, label?: string | null) => {
    try {
      const rows: any[] = await numbersApi.exportNumbers(campaignId);
      // Filter by specific label if provided (more precise, handles MISSED subtypes like NA/HANG UP).
      // Fall back to matching by agentResult enum type.
      const filtered = rows.filter(r =>
        label
          ? r.agentResultLabel === label
          : r.agentResult === result,
      );
      const filename = label
        ? `agent_${label}_${campaign?.name ?? campaignId}.csv`
        : `agent_${result}_${campaign?.name ?? campaignId}.csv`;
      buildExportCsv(filtered, filename);
      toast(`Скачано ${filtered.length} номеров`, 'success');
    } catch { toast('Ошибка скачивания', 'error'); }
  };

  const downloadAllDialResults = async () => {
    try {
      const rows: any[] = await numbersApi.exportNumbers(campaignId);
      buildExportCsv(rows, `export_${campaign?.name ?? campaignId}.csv`);
      toast(`Скачано ${rows.length} номеров`, 'success');
    } catch { toast('Ошибка скачивания', 'error'); }
  };

  const downloadAllAgentResults = async () => {
    try {
      const rows: any[] = await numbersApi.exportNumbers(campaignId);
      const filtered = rows.filter(r => r.agentResult && r.agentResult !== '');
      buildExportCsv(filtered, `agent_all_${campaign?.name ?? campaignId}.csv`);
      toast(`Скачано ${filtered.length} номеров`, 'success');
    } catch { toast('Ошибка скачивания', 'error'); }
  };

  if (loadingCampaign) return (
    <div className="p-6 text-muted-foreground text-sm flex items-center gap-2">
      <RefreshCw size={14} className="animate-spin" /> Загрузка...
    </div>
  );
  if (!campaign) return <div className="p-6 text-muted-foreground text-sm">Кампания не найдена</div>;

  // Numbers with no dialResult yet (haven't been called) — "ACTIVE" row in dial stats
  const activeInQueue = (numStats?.dialerStats ?? []).find((g: any) => g.dialResult === null || g.dialResult === 'ACTIVE')?.count ?? 0;
  // Numbers that have been attempted (have any dialResult)
  const total = nd?.total ?? 0;
  const processed = total - activeInQueue;
  const pct = total > 0 ? Math.round((activeInQueue / total) * 100) : 0;

  // ── Summary table metrics ──────────────────────────────────────────────────
  const _statsMapSummary = Object.fromEntries(
    (numStats?.dialerStats ?? []).map((g: any) => [g.dialResult ?? 'ACTIVE', g])
  );
  const _answeredCount   = _statsMapSummary['ANSWERED']?.count ?? 0;
  // Operator-set MISSED = автоответчики / недозвоны выставленные оператором
  const _missedByOp = (numStats?.agentStats ?? [])
    .filter((s: any) => s.type === 'MISSED')
    .reduce((sum: number, s: any) => sum + (s.count ?? 0), 0);
  // Набрано системой = все прозвоненные номера минус те, где оператор сам поставил MISSED
  const sumCalledBySystem   = Math.max(0, processed - _missedByOp);
  const pctCalledBySystem   = total > 0 ? +(sumCalledBySystem / total * 100).toFixed(1) : 0;
  // Ответили = Отвечено − оператор-MISSED
  const sumAnswered         = Math.max(0, _answeredCount - _missedByOp);
  const pctAnsweredOfCalled = sumCalledBySystem > 0 ? +(sumAnswered / sumCalledBySystem * 100).toFixed(1) : 0;
  // Остаток = все номера − Ответили
  const sumRemainder        = Math.max(0, total - sumAnswered);
  const pctRemainder        = total > 0 ? +(sumRemainder / total * 100).toFixed(1) : 0;

  const downloadSummaryExcel = () => {
    const headers = ['Название','К-во номеров изначально','Набрано системой','% набранных','Ответили','% отвеченных от набранных','Остаток','% остатка'];
    const row = [campaign.name, total, sumCalledBySystem, `${pctCalledBySystem}%`, sumAnswered, `${pctAnsweredOfCalled}%`, sumRemainder, `${pctRemainder}%`];
    const csv = [headers, row].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const bom = '﻿';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${campaign.name}_сводка.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSummaryPdf = () => {
    const rows = [
      ['К-во номеров изначально', total, '—'],
      ['Набрано системой',        sumCalledBySystem, `${pctCalledBySystem}%`],
      ['Ответили',                sumAnswered,        `${pctAnsweredOfCalled}% от набранных`],
      ['Остаток',                 sumRemainder,       `${pctRemainder}%`],
    ];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Сводка — ${campaign.name}</title>
<style>
  body{font-family:Arial,sans-serif;padding:32px;color:#111}
  h2{margin:0 0 6px;font-size:18px}
  p.sub{margin:0 0 24px;color:#666;font-size:13px}
  table{border-collapse:collapse;width:100%}
  th{background:#f0f0f0;padding:10px 16px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.05em;border:1px solid #ddd}
  td{padding:10px 16px;border:1px solid #ddd;font-size:14px}
  td:nth-child(2){text-align:right;font-weight:700;font-size:16px}
  td:nth-child(3){text-align:right;color:#555}
  @media print{@page{margin:20mm}}
</style></head><body>
<h2>Кампания: ${campaign.name}</h2>
<p class="sub">Дата: ${new Date().toLocaleDateString('ru-RU')}</p>
<table>
  <thead><tr><th>Показатель</th><th style="text-align:right">Значение</th><th style="text-align:right">%</th></tr></thead>
  <tbody>${rows.map(([label, val, pct]) => `<tr><td>${label}</td><td>${val}</td><td>${pct}</td></tr>`).join('')}</tbody>
</table>
</body></html>`;
    const w = window.open('', '_blank', 'width=900,height=600');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  };
  const dialModeLabel = { PREDICTIVE: 'Предиктив', PROGRESSIVE: 'Прогрессив' }[campaign.dialMode as 'PREDICTIVE' | 'PROGRESSIVE'] ?? campaign.dialMode;

  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-accent rounded-md">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dialModeLabel} · {campaign.timeFrom}–{campaign.timeTo}
            {campaign.provider && ` · ${campaign.provider.name}`}
            {campaign.form && ` · ${campaign.form.name}`}
            {campaign.script && ` · Скрипт: ${campaign.script.name}`}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Dialer running indicator */}
          {campaign.status === 'ACTIVE' && (
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Обзвон идёт · {dialerStatus?.activeCalls ?? 0} звонков
            </span>
          )}

          {/* Single dropdown for all actions */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none data-[state=open]:bg-accent">
                <MoreHorizontal size={15} /> Действия
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownContent>
                {/* Start / Stop — недоступно для заблокированных */}
                {campaign.status !== 'BLOCKED' && (
                  campaign.status === 'ACTIVE' ? (
                    <DropdownItem icon={<StopCircle size={13} />} onClick={() => stopDialer.mutate()} variant="danger">
                      Остановить обзвон
                    </DropdownItem>
                  ) : (
                    <DropdownItem icon={<PlayCircle size={13} />} onClick={() => startDialer.mutate()}>
                      Запустить обзвон
                    </DropdownItem>
                  )
                )}
                <DropdownSeparator />
                <DropdownItem icon={<Edit2 size={13} />} onClick={openEdit}>
                  Редактировать
                </DropdownItem>
                <DropdownItem icon={<Plus size={13} />} onClick={() => setAddModal(true)}>
                  Добавить номера
                </DropdownItem>
                <DropdownItem icon={<Trash2 size={13} />} onClick={() => setDeleteModal(true)}>
                  Удалить номера
                </DropdownItem>
                <DropdownSeparator />
                {/* Block / Unblock */}
                {campaign.status === 'BLOCKED' ? (
                  <DropdownItem icon={<Unlock size={13} />} onClick={() => unblockCampaign.mutate()}>
                    Разблокировать
                  </DropdownItem>
                ) : (
                  <DropdownItem icon={<Lock size={13} />} onClick={() => blockCampaign.mutate()} variant="danger">
                    Заблокировать
                  </DropdownItem>
                )}
                <DropdownSeparator />
                <DropdownItem variant="danger" icon={<Trash2 size={13} />}
                  onClick={() => { if (confirm(`Удалить «${campaign.name}»?`)) { removeCampaign.mutate(); } }}>
                  Удалить кампанию
                </DropdownItem>
              </DropdownContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* ── Summary table ── */}
      {nd && nd.total > 0 && (
        <div className="bg-card border border-border rounded-xl mb-5 overflow-hidden">
          {/* Header row */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Сводка обзвона</span>
            <div className="flex items-center gap-2">
              <button onClick={downloadSummaryPdf}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                <FileText size={12} /> PDF
              </button>
              <button onClick={downloadSummaryExcel}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                <Sheet size={12} /> Excel
              </button>
            </div>
          </div>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {[
                    'Название',
                    'К-во номеров изначально',
                    'Набрано системой',
                    '% набранных',
                    'Ответили',
                    '% отвеченных от набранных',
                    'Остаток',
                    '% остатка',
                  ].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap max-w-[200px] truncate">
                    {campaign.name}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-foreground text-base">
                    {total.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-foreground text-base">
                    {sumCalledBySystem.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {pctCalledBySystem}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-green-400 text-base">
                    {sumAnswered.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                      {pctAnsweredOfCalled}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-foreground text-base">
                    {sumRemainder.toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
                      {pctRemainder}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex border-b border-border mb-5">
        {([
          ['numbers', 'Номера'],
          ['stats',   'Статистика'],
          ['edit',    'Редактировать'],
        ] as [Tab, string][]).map(([val, label]) => (
          <button key={val} onClick={() => { setTab(val); if (val === 'edit') openEdit(); }}
            className={['px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === val ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground',
            ].join(' ')}>
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════ NUMBERS TAB ═══════════════════════════ */}
      {tab === 'numbers' && (
        <div className="space-y-5">

          {/* ── Billing strip ── */}
          <div className="bg-card border border-border rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              Биллинг
              {billingTotal > 0 && <span className="text-xs text-muted-foreground font-normal">{billingTotal} звонков</span>}
            </span>
            <div className="flex items-center gap-2">
              {(['ALL', 'OUTBOUND'] as const).map(d => (
                <button key={d} onClick={() => setBillingDir(d)}
                  className={['text-xs px-2 py-0.5 rounded-full border transition-colors font-medium',
                    billingDir === d ? 'bg-primary/10 text-primary border-primary/40' : 'text-muted-foreground border-border hover:text-foreground',
                  ].join(' ')}>
                  {d === 'ALL' ? 'Все' : '↑ Исх.'}
                </button>
              ))}
              <button onClick={downloadBillingCsv}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors ml-1">
                <Download size={12} /> CSV
              </button>
            </div>
          </div>

          {/* ── Dialer Results Table ── */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20">
              <h3 className="text-sm font-medium text-foreground">Результаты набора номера</h3>
              <button
                onClick={downloadAllDialResults}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <FileDown size={12} /> Скачать всё
              </button>
            </div>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Статус</th>
                  <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Номеров</th>
                  <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Список</th>
                  <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Скачать</th>
                  <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Обновить</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {!numStats && (
                  <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground text-sm">Загрузка...</td></tr>
                )}
                {numStats?.dialerStats?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center">
                      <Phone size={32} className="mx-auto mb-2 text-muted-foreground/20" />
                      <p className="text-sm text-muted-foreground">Нет данных</p>
                    </td>
                  </tr>
                )}
                {(() => {
                  const statsMap = Object.fromEntries(
                    (numStats?.dialerStats ?? []).map((g: any) => [g.dialResult ?? 'ACTIVE', g])
                  );
                  const NO_BREAKDOWN = new Set(['ANSWERED', 'ACTIVE', 'PENDING_ACW', 'BLACKLISTED']);

                  // ── Per-dialResult single rows ──────────────────────────────────────
                  const dialRows = DIAL_STATUS_ORDER.map(key => {
                    const cfg = DIAL_STATUS_CFG[key];
                    const g = statsMap[key];
                    const count = g?.count ?? 0;
                    // ACTIVE = can reset nextCallAt (unstick numbers waiting in queue)
                    // ANSWERED / PENDING_ACW / BLACKLISTED = terminal or in-progress, no reset
                    const canRetry = key !== 'BLACKLISTED' && key !== 'ANSWERED' && key !== 'PENDING_ACW';
                    const retryTitle = key === 'ACTIVE'
                      ? 'Повторить сейчас (сбросить таймер ожидания)'
                      : 'Сбросить и повторить';
                    return (
                      <tr key={key} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotColor}`} />
                            <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">{count}</td>
                        <td className="px-4 py-3 text-center">
                          {count > 0
                            ? <button onClick={() => setPhoneHistoryDialResult(key)} className="p-1.5 rounded text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors" title="Посмотреть номера"><List size={13} /></button>
                            : <span className="text-muted-foreground/30"><List size={13} /></span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => downloadDialResult(key)} disabled={count === 0} className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title="Скачать CSV"><Download size={13} /></button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {canRetry
                            ? <button onClick={() => retryDialResult.mutate(key)} disabled={count === 0} className="p-1.5 rounded text-muted-foreground hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" title={retryTitle}><Phone size={13} /></button>
                            : <span className="text-muted-foreground/20">—</span>}
                        </td>
                      </tr>
                    );
                  });

                  // ── Merged cause breakdown (deduplicated across all dialResults) ────
                  const mergedCauses = new Map<number, number>();
                  for (const key of DIAL_STATUS_ORDER) {
                    if (NO_BREAKDOWN.has(key)) continue;
                    const g = statsMap[key];
                    const actualCauses: { cause: number; count: number }[] = g?.causes ?? [];
                    const templateCodes = DIALRESULT_CAUSE_TEMPLATE[key] ?? [];
                    const causeMap = new Map(actualCauses.map(c => [c.cause, c.count]));
                    const allCodes = [
                      ...templateCodes,
                      ...actualCauses.map(c => c.cause).filter(c => !templateCodes.includes(c)),
                    ];
                    // Also account for numbers without causeCode (Прочие, cause -1)
                    const shownCount = allCodes.reduce((s, c) => s + (causeMap.get(c) ?? 0), 0);
                    const otherCount = (g?.count ?? 0) - shownCount;
                    for (const code of allCodes) {
                      const cnt = causeMap.get(code) ?? 0;
                      if (cnt > 0) mergedCauses.set(code, (mergedCauses.get(code) ?? 0) + cnt);
                    }
                    if (otherCount > 0) mergedCauses.set(-1, (mergedCauses.get(-1) ?? 0) + otherCount);
                  }
                  const sortedCauses = Array.from(mergedCauses.entries()).sort((a, b) => b[1] - a[1]);

                  const causeRows = sortedCauses.length === 0 ? [] : [
                    <tr key="cause-separator">
                      <td colSpan={5} className="px-4 pt-4 pb-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Причины завершения</span>
                      </td>
                    </tr>,
                    ...sortedCauses.map(([cause, cnt]) => {
                      const ci = getCauseInfo(cause);
                      return (
                        <tr key={`cause-${cause}`} className="hover:bg-accent/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="group relative cursor-help inline-flex items-center gap-1.5 pl-4">
                              <span className="text-sm font-medium text-foreground">{ci.label}</span>
                              {cause >= 0 && (
                                <span className="text-[10px] font-mono text-muted-foreground/60 bg-muted/60 px-1 py-0.5 rounded">{cause}</span>
                              )}
                              <span className="absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[100] hidden group-hover:flex flex-col gap-0.5 bg-white border border-gray-200 rounded-lg shadow-2xl p-3 min-w-[260px] max-w-[340px] text-left pointer-events-none font-normal !opacity-100">
                                <span className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-semibold text-gray-900">{ci.label}</span>
                                  <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">[{ci.code}]</span>
                                </span>
                                <span className="text-xs text-gray-600 mt-1 leading-relaxed">{ci.description}</span>
                                <span className="text-[10px] font-mono text-gray-400 mt-1">{ci.sip}</span>
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-sm font-semibold text-foreground">{cnt}</td>
                          <td colSpan={3} />
                        </tr>
                      );
                    }),
                  ];

                  return [...dialRows, ...causeRows];
                })()}
                {/* Total row */}
                {numStats && numStats.total > 0 && (
                  <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                    <td className="px-4 py-3 text-sm text-foreground">Итого</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-foreground">{numStats.total}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={downloadAllDialResults}
                        className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Скачать всё"
                      >
                        <Download size={13} />
                      </button>
                    </td>
                    <td colSpan={1} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Agent Results Table ── */}
          {numStats?.agentTotal > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <h3 className="text-sm font-medium text-foreground">Результаты агента</h3>
              </div>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Результат</th>
                    <th className="px-4 py-2.5 text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Звонков</th>
                    <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Скачать</th>
                    <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Обновить</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {numStats.agentStats.map((g: any) => {
                    // g.label = specific label ("Согласие 10:00"), g.type = enum ("AGREE")
                    const displayLabel = g.label ?? g.result ?? 'NONE';
                    const resultType   = g.type  ?? g.result ?? null;
                    const cfg = resultType ? RESULT_CFG[resultType] : null;
                    return (
                      <tr key={displayLabel} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          {cfg
                            ? <span className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${cfg.color} ${cfg.bg}`}>{displayLabel}</span>
                            : <span className="text-sm text-muted-foreground">{displayLabel}</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">{g.count}</td>
                        <td className="px-4 py-3 text-center">
                          {resultType && (
                            <button
                              onClick={() => downloadAgentResult(resultType, g.label ?? null)}
                              className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title="Скачать CSV"
                            >
                              <Download size={13} />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {resultType === 'MISSED' || resultType === 'CALLBACK' ? (
                            <button
                              onClick={() => retryAgentResult.mutate({ type: resultType, label: g.label ?? null })}
                              disabled={retryAgentResult.isPending}
                              className="p-1.5 rounded text-muted-foreground hover:text-green-400 hover:bg-green-400/10 transition-colors disabled:opacity-40"
                              title="Вернуть в набор"
                            >
                              <PhoneCall size={13} />
                            </button>
                          ) : (
                            <span className="text-muted-foreground/20">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                    <td className="px-4 py-3 text-sm text-foreground">Итого</td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-foreground">{numStats.agentTotal}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={downloadAllAgentResults}
                        className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Скачать все результаты агента"
                      >
                        <Download size={13} />
                      </button>
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════════ STATS TAB ═════════════════════════════ */}
      {tab === 'stats' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* ── Dial results pie — по номерам (numStats.dialerStats) ── */}
          <StatsPieChart
            title="Статус набора по номерам"
            slices={(() => {
              if (!numStats?.dialerStats?.length) return [];
              const COLORS: Record<string, string> = {
                ANSWERED:    '#4ade80',
                NO_ANSWER:   '#6b7280',
                BUSY:        '#fb923c',
                CANCELLED:   '#94a3b8',
                INTERRUPTED: '#facc15',
                ERROR:       '#facc15',
                INVALID:     '#f87171',
                REJECTED:    '#f87171',
                ERROR_CREATE:'#f87171',
                BLACKLISTED: '#a78bfa',
                ACTIVE:      '#3b7efe',
              };
              return (numStats.dialerStats as any[])
                .filter((g: any) => g.count > 0)
                .map((g: any) => {
                  const key = g.dialResult ?? 'ACTIVE';
                  return {
                    label: DIAL_STATUS_CFG[key]?.label ?? key,
                    value: g.count,
                    color: COLORS[key] ?? '#8b8ba0',
                  };
                });
            })()}
            emptyText="Нет данных по статусам набора"
          />

          {/* ── Agent results pie — по номерам (numStats.agentStats) ── */}
          <StatsPieChart
            title="Результаты агента по номерам"
            slices={(() => {
              if (!numStats?.agentStats?.length) return [];
              const COLORS: Record<string, string> = {
                AGREE: '#4ade80', REFUSE: '#f87171', CALLBACK: '#60a5fa',
                VOICEMAIL: '#facc15', MISSED: '#6b7280',
              };
              return (numStats.agentStats as any[])
                .filter((g: any) => g.count > 0)
                .map((g: any) => {
                  const resultType = g.type ?? g.result ?? 'NONE';
                  return {
                    label: g.label ?? g.result ?? 'NONE',
                    value: g.count,
                    color: COLORS[resultType] ?? '#8b8ba0',
                  };
                });
            })()}
            emptyText="Нет данных по результатам агента"
          />
        </div>
      )}

      {/* ════════════════════════════════ EDIT TAB ══════════════════════════════ */}
      {tab === 'edit' && editForm && (
        <div className="max-w-2xl bg-card border border-border rounded-xl overflow-hidden flex flex-col">
          {/* Sub-tabs */}
          <div className="flex border-b border-border px-2 pt-2">
            {([
              ['settings', 'Настройки'],
              ['limits',   `Лимиты результатов${formResultOptions.length > 0 ? ` (${formResultOptions.length})` : ''}`],
            ] as [EditSubTab, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setEditSubTab(val)}
                className={['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  editSubTab === val ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground',
                ].join(' ')}>
                {label}
              </button>
            ))}
          </div>
        <div className="p-6 flex flex-col gap-5">
          {editSubTab === 'settings' && <><Input label="Название кампании *" value={editForm.name} onChange={e => setEditForm((p: any) => ({ ...p, name: e.target.value }))} />

          <div>
            <p className="text-xs text-muted-foreground mb-2">Режим обзвона</p>
            <div className="grid grid-cols-3 gap-3">
              {DIAL_OPTS.map(o => (
                <button key={o.value}
                  disabled={(o as any).disabled}
                  onClick={() => !(o as any).disabled && setEditForm((p: any) => ({ ...p, dialMode: o.value }))}
                  className={['p-3 rounded-xl border text-left transition-all', (o as any).disabled ? 'opacity-40 cursor-not-allowed border-border' : editForm.dialMode === o.value ? 'border-primary bg-primary/15' : 'border-border hover:border-primary'].join(' ')}>
                  <div className="font-semibold text-sm text-foreground">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {editForm.dialMode === 'PREDICTIVE' && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-400">
              🚧 Предиктивный режим находится на стадии доработки и будет доступен в ближайших обновлениях
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Начало работы" type="time" value={editForm.timeFrom} onChange={e => setEditForm((p: any) => ({ ...p, timeFrom: e.target.value }))} />
            <Input label="Конец работы" type="time" value={editForm.timeTo} onChange={e => setEditForm((p: any) => ({ ...p, timeTo: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Провайдер" value={editForm.providerId} onChange={e => setEditForm((p: any) => ({ ...p, providerId: e.target.value }))}>
              <option value="">— Без провайдера —</option>
              {(providers as any[]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <div className="flex flex-col gap-1.5 w-full">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">Форма оператора</label>
                {formLocked && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                    <Lock size={9} /> Заблокировано
                  </span>
                )}
              </div>
              <Select
                value={editForm.formId}
                disabled={formLocked}
                onChange={e => setEditForm((p: any) => ({ ...p, formId: e.target.value }))}
                title={formLocked ? 'Форма заблокирована — в кампанию уже был импорт номеров' : undefined}
              >
                <option value="">— Без формы —</option>
                {(forms as Form[]).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
              {formLocked && (
                <p className="text-[11px] text-amber-400/80">
                  Смена формы недоступна — в кампанию уже был выполнен импорт номеров
                </p>
              )}
            </div>
          </div>

          <Select label="Скрипт звонка" value={editForm.scriptId} onChange={e => setEditForm((p: any) => ({ ...p, scriptId: e.target.value }))}>
            <option value="">— Без скрипта —</option>
            {(scripts as any[]).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Команды</p>
            <div className="flex flex-wrap gap-2">
              {(teams as any[]).map(t => (
                <label key={t.id} className={['flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-all',
                  editForm.teamIds.includes(t.id) ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:border-primary'].join(' ')}>
                  <input type="checkbox" className="sr-only" checked={editForm.teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>

          {/* Forced connection toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-accent/40 rounded-xl border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Принудительное соединение</p>
              <p className="text-xs text-muted-foreground">Звонок сразу соединяет оператора без кнопки "Ответить"</p>
            </div>
            <button
              type="button"
              onClick={() => setEditForm((p: any) => ({ ...p, forcedConnection: !p.forcedConnection }))}
              className={['relative inline-flex h-6 w-11 rounded-full transition-colors',
                editForm.forcedConnection ? 'bg-primary' : 'bg-muted'].join(' ')}
            >
              <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                editForm.forcedConnection ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
            </button>
          </div>

          {/* [INBOUND HIDDEN] allowInbound toggle */}
          {/* [INBOUND HIDDEN] isGeneralInbound toggle */}
          {/* [INBOUND HIDDEN] inbound operators counter */}

          <Select
            label="Таймаут ACW (после звонка)"
            value={editForm.acwTimeout}
            onChange={e => setEditForm((p: any) => ({ ...p, acwTimeout: e.target.value }))}
          >
            {ACW_TIMEOUT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>

          </>}

          {/* Result limits sub-tab */}
          {editSubTab === 'limits' && (
            formResultOptions.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                К кампании не привязана форма с полем "Результат"
              </div>
            ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">Результат скрывается у оператора при достижении лимита. 0 = без ограничений.</p>
              <div className="bg-accent/30 border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Результат</th>
                      <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium w-28">Тип</th>
                      <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground font-medium w-24">Сделано</th>
                      <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground font-medium w-28">Лимит</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {formResultOptions.map((r: any) => {
                      const done  = resultCounts[r.label] ?? 0;
                      // undefined = no limit, 0 = no limit (∞), N > 0 = limit
                      const limit = editForm.resultLimits != null ? editForm.resultLimits[r.label] : undefined;
                      const hit   = limit !== undefined && limit !== null && limit > 0 && done >= limit;
                      // Invalid: limit is set to a positive value but less than already done
                      const invalid = limit !== undefined && limit !== null && limit > 0 && limit < done;
                      const typeCfg = RESULT_CFG[r.type];
                      return (
                        <tr key={r.label} className={invalid ? 'bg-red-500/5' : hit ? 'bg-yellow-500/5' : ''}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={['w-2 h-2 rounded-full flex-shrink-0',
                                r.type === 'AGREE' ? 'bg-green-400' :
                                r.type === 'REFUSE' ? 'bg-red-400' :
                                r.type === 'CALLBACK' ? 'bg-blue-400' :
                                r.type === 'VOICEMAIL' ? 'bg-yellow-400' : 'bg-muted-foreground',
                              ].join(' ')} />
                              <span className="text-foreground font-medium">{r.label}</span>
                              {hit && !invalid && <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full ml-1">Лимит</span>}
                              {invalid && <span className="text-[10px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded-full ml-1">Лимит &lt; сделано</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={['text-[11px] font-medium px-2 py-0.5 rounded-full', typeCfg?.color ?? 'text-muted-foreground', typeCfg?.bg ?? 'bg-muted/40'].join(' ')}>
                              {typeCfg?.label ?? r.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={['text-sm font-mono font-semibold', invalid ? 'text-orange-400' : hit ? 'text-red-400' : 'text-foreground'].join(' ')}>{done}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              min={0}
                              value={limit ?? ''}
                              onChange={e => {
                                const raw = e.target.value.trim();
                                setEditForm((p: any) => {
                                  const newLimits = { ...(p.resultLimits ?? {}) };
                                  if (raw === '') {
                                    delete newLimits[r.label]; // no limit
                                  } else {
                                    newLimits[r.label] = Math.max(0, parseInt(raw) || 0);
                                  }
                                  return { ...p, resultLimits: Object.keys(newLimits).length ? newLimits : null };
                                });
                              }}
                              className={['w-20 text-center bg-background border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                                invalid ? 'border-orange-500 focus:ring-orange-500/50' : 'border-border',
                              ].join(' ')}
                              placeholder="∞"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )

          )}

          {(() => {
            const hasLimitError = formResultOptions.some((r: any) => {
              const done  = resultCounts[r.label] ?? 0;
              const limit = editForm.resultLimits != null ? editForm.resultLimits[r.label] : undefined;
              return limit !== undefined && limit !== null && limit > 0 && limit < done;
            });
            return (
              <>
                {hasLimitError && (
                  <p className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
                    Нельзя сохранить: лимит не может быть меньше уже сделанного количества. Увеличьте лимит или очистите поле (∞).
                  </p>
                )}
                <div className="flex gap-3 pt-2">
                  <Button loading={saveCampaign.isPending} disabled={!editForm.name?.trim() || hasLimitError} onClick={() => saveCampaign.mutate()}>
                    <Save size={14} /> Сохранить
                  </Button>
                  <Button variant="secondary" onClick={() => setTab('numbers')}>Отмена</Button>
                </div>
              </>
            );
          })()}
        </div>
        </div>
      )}

      {/* ════════════════════════════════ ADD MODAL ═════════════════════════════ */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setBulkText(''); setCsvEntries([]); setCsvFileName(''); }} title="Добавить номера" width="w-[540px]">
        <div className="space-y-4">
          <div className="flex border-b border-border">
            {([['text', 'Текстом'], ['csv', 'CSV файл']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setAddTab(val)}
                className={['px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  addTab === val ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'].join(' ')}>
                {label}
              </button>
            ))}
          </div>

          {addTab === 'text' && (
            <>
              <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 text-xs text-muted-foreground space-y-1">
                <p>• Один номер на строку, или через запятую/точку с запятой</p>
                <p>• Дубликаты будут пропущены</p>
              </div>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                placeholder={'+79991234567\n+79997654321'} rows={9}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono" />
              <p className="text-xs text-muted-foreground">~{bulkText.split(/[\n,;]+/).filter(p => p.trim()).length} номеров</p>
            </>
          )}

          {addTab === 'csv' && (
            <>
              {campaign.form && (
                <div className="flex items-center justify-between bg-muted/40 border border-border rounded-lg px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-foreground">Форма: {campaign.form.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Скачайте шаблон с полями формы</p>
                  </div>
                  <button onClick={() => downloadTemplate(templateFields)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors ml-3">
                    <Download size={13} /> Шаблон
                  </button>
                </div>
              )}
              {csvFileName ? (
                <div className="flex items-center gap-3 border border-border rounded-xl px-4 py-3 bg-muted/20">
                  <FileCheck size={18} className="text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{csvFileName}</p>
                    <p className="text-xs text-muted-foreground">{csvEntries.length} номеров</p>
                  </div>
                  <button onClick={() => { setCsvEntries([]); setCsvFileName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary transition-colors text-muted-foreground">
                  <Upload size={22} />
                  <span className="text-sm">Перетащите CSV или <span className="text-primary">выберите</span></span>
                  <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleCsvFile} />
                </label>
              )}
            </>
          )}

          <div className="flex gap-3 pt-1">
            <Button loading={addNumbers.isPending} disabled={addTab === 'text' ? !bulkText.trim() : csvEntries.length === 0} onClick={() => addNumbers.mutate()}>
              <Upload size={14} /> Загрузить
            </Button>
            <Button variant="secondary" onClick={() => { setAddModal(false); setBulkText(''); setCsvEntries([]); setCsvFileName(''); }}>Отмена</Button>
          </div>
        </div>
      </Modal>

      {/* ════════════════════════════════ DELETE BY FILE MODAL ══════════════════ */}
      <Modal
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeletePhones([]); setDeleteFileName(''); }}
        title="Удалить по файлу"
        width="w-[500px]"
      >
        <div className="space-y-4">
          <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p>• CSV или TXT файл — один номер на строку или в столбце A</p>
            <p>• Всего номеров в базе: <span className="font-semibold text-foreground">{nd?.total ?? 0}</span></p>
          </div>

          {deleteFileName ? (
            <div className="flex items-center gap-3 border border-border rounded-xl px-4 py-3 bg-muted/20">
              <FileCheck size={18} className="text-destructive flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{deleteFileName}</p>
                <p className="text-xs text-muted-foreground">{deletePhones.length} номеров к удалению</p>
              </div>
              <button
                onClick={() => { setDeletePhones([]); setDeleteFileName(''); if (deleteFileRef.current) deleteFileRef.current.value = ''; }}
                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-destructive transition-colors text-muted-foreground">
              <Upload size={22} />
              <span className="text-sm">Перетащите файл или <span className="text-primary">выберите</span></span>
              <span className="text-xs">CSV, TXT</span>
              <input ref={deleteFileRef} type="file" accept=".csv,.txt" className="sr-only" onChange={handleDeleteFile} />
            </label>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              variant="danger"
              loading={deleteBulk.isPending}
              disabled={deletePhones.length === 0}
              onClick={() => deleteBulk.mutate()}
            >
              <Trash2 size={14} /> Удалить {deletePhones.length > 0 ? `(${deletePhones.length})` : ''}
            </Button>
            <Button variant="secondary" onClick={() => { setDeleteModal(false); setDeletePhones([]); setDeleteFileName(''); }}>Отмена</Button>
          </div>
        </div>
      </Modal>

      {/* Phone history modal */}
      {phoneHistoryDialResult && (
        <PhoneHistoryModal
          campaignId={campaignId}
          dialResult={phoneHistoryDialResult}
          onClose={() => setPhoneHistoryDialResult(null)}
        />
      )}
    </div>
  );
}
