'use client';
import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useWsNav } from '@/lib/use-ws-nav';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import {
  ArrowLeft, Plus, Trash2, Phone, RefreshCw, X, CheckCircle2,
  Upload, BarChart2, Download, FileCheck, Edit2, Save, PhoneCall,
  Clock, TrendingUp, Users, FileDown, PlayCircle, StopCircle,
  MoreHorizontal, Lock, Unlock, Circle, PhoneIncoming, List,
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

const DIAL_OPTS = [
  { value: 'PREDICTIVE',  label: 'Предиктив',  desc: 'Авто набор с опережением' },
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
  const { push: wsPush } = useWsNav();
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
    enabled: tab === 'numbers' || tab === 'stats',
    refetchInterval: (tab === 'numbers' || tab === 'stats') ? 15_000 : false,
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
    onSuccess: () => { toast('Кампания удалена', 'success'); wsPush('/admin/campaigns'); },
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
    mutationFn: (agentResult: string | null) => numbersApi.resetByAgentResult(campaignId, agentResult),
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
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setCsvEntries(parseCsv(ev.target?.result as string));
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

      const dataKeys = Array.from(new Set(rows.flatMap((r: any) => Object.keys(r.data ?? {})))).filter((k: string) => k.trim() !== '');
      const headers = [
        'Тип', 'Телефон', ...dataKeys,
        'Оператор', 'Код причины', 'Кто завершил',
        'Начало', 'Ответ', 'Конец', 'Длительность (сек)', 'Результат агента',
      ];
      const csvRows = rows.map((r: any) => [
        r.direction === 'INBOUND' ? 'Входящий' : 'Исходящий',
        r.phone,
        ...dataKeys.map((k: string) => r.data?.[k] ?? ''),
        r.operator ?? '—',
        r.cause !== '' && r.cause != null ? String(r.cause) : '—',
        r.hungupBy ?? '—',
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
    // Collect all unique data keys (form fields) from all rows
    const dataKeys = Array.from(new Set(rows.flatMap(r => Object.keys(r.data ?? {})))).filter(k => k.trim() !== '');
    const headers = [
      'Телефон', ...dataKeys,
      'Кол-во наборов', 'Статус набора', 'Код причины', 'Кто завершил',
      'Начало', 'Конец', 'Длительность (сек)', 'Результат агента',
    ];
    const csvRows = rows.map(r => [
      r.phone,
      ...dataKeys.map(k => r.data?.[k] ?? ''),
      r.attempts != null ? String(r.attempts) : '0',
      DIAL_STATUS_CFG[r.dialResult]?.label ?? r.dialResult,
      r.cause !== '' && r.cause != null ? String(r.cause) : '—',
      r.hungupBy ?? '—',
      fmtIso(r.startedAt),
      fmtIso(r.endedAt),
      r.duration !== '' && r.duration != null ? String(r.duration) : '—',
      r.agentResultLabel || (r.agentResult && r.agentResult !== 'MISSED' ? (RESULT_CFG[r.agentResult]?.label ?? r.agentResult) : '—'),
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

  const downloadAgentResult = async (result: string) => {
    try {
      const rows: any[] = await numbersApi.exportNumbers(campaignId);
      const filtered = rows.filter(r => r.agentResult === result);
      buildExportCsv(filtered, `agent_${result}_${campaign?.name ?? campaignId}.csv`);
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

      {/* ── Progress bar ── */}
      {nd && nd.total > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">Прогресс обзвона</span>
            <span className="text-sm font-bold text-primary">{pct}% осталось</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
            <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            {[
              { label: 'Всего',      val: total,          color: 'text-foreground' },
              { label: 'Активных',   val: dialerStatus?.activeCalls ?? 0, color: 'text-green-400' },
              { label: 'Осталось',   val: activeInQueue,  color: 'text-primary' },
              { label: 'Обработано', val: processed,      color: 'text-muted-foreground' },
            ].map(s => (
              <div key={s.label}>
                <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
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
              {(['ALL', 'OUTBOUND', 'INBOUND'] as const).map(d => (
                <button key={d} onClick={() => setBillingDir(d)}
                  className={['text-xs px-2 py-0.5 rounded-full border transition-colors font-medium',
                    billingDir === d ? 'bg-primary/10 text-primary border-primary/40' : 'text-muted-foreground border-border hover:text-foreground',
                  ].join(' ')}>
                  {d === 'ALL' ? 'Все' : d === 'OUTBOUND' ? '↑ Исх.' : '↓ Вх.'}
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
                {DIAL_STATUS_ORDER.map(key => {
                  const cfg = DIAL_STATUS_CFG[key];
                  const statsMap = Object.fromEntries(
                    (numStats?.dialerStats ?? []).map((g: any) => [g.dialResult ?? 'ACTIVE', g])
                  );
                  const g = statsMap[key];
                  const count = g?.count ?? 0;
                  const retryable = g?.retryable ?? 0;
                  return (
                    <tr key={key} className={`hover:bg-accent/30 transition-colors ${count === 0 ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dotColor}`} />
                          <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">
                        {count}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {count > 0 ? (
                          <button
                            onClick={() => setPhoneHistoryDialResult(key)}
                            className="p-1.5 rounded text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
                            title="Посмотреть номера"
                          >
                            <List size={13} />
                          </button>
                        ) : (
                          <span className="text-muted-foreground/30"><List size={13} /></span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => downloadDialResult(key)}
                          disabled={count === 0}
                          className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Скачать CSV"
                        >
                          <Download size={13} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {key !== 'ACTIVE' && key !== 'BLACKLISTED' && key !== 'ANSWERED' && key !== 'PENDING_ACW' ? (
                          <button
                            onClick={() => retryDialResult.mutate(key)}
                            disabled={count === 0}
                            className="p-1.5 rounded text-muted-foreground hover:text-green-400 hover:bg-green-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Сбросить и повторить"
                          >
                            <Phone size={13} />
                          </button>
                        ) : (
                          <span className="text-muted-foreground/20">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
                              onClick={() => downloadAgentResult(resultType)}
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
                              onClick={() => retryAgentResult.mutate(resultType)}
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
                <button key={o.value} onClick={() => setEditForm((p: any) => ({ ...p, dialMode: o.value }))}
                  className={['p-3 rounded-xl border text-left transition-all', editForm.dialMode === o.value ? 'border-primary bg-primary/15' : 'border-border hover:border-primary'].join(' ')}>
                  <div className="font-semibold text-sm text-foreground">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {editForm.dialMode === 'PREDICTIVE' && (
            <div className="bg-accent/40 border border-border rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Параметры предиктива</p>

              {/* Overhead slider */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Оверхед набора</span>
                  <span className="text-sm font-semibold text-foreground">
                    {editForm.dialOverheadPct}%
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      (× {(1 + editForm.dialOverheadPct / 100).toFixed(2)})
                    </span>
                  </span>
                </div>
                <input
                  type="range"
                  min={0} max={200} step={5}
                  value={editForm.dialOverheadPct}
                  onChange={e => setEditForm((p: any) => ({ ...p, dialOverheadPct: Number(e.target.value) }))}
                  className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0% — 1:1</span>
                  <span>20% — ×1.2</span>
                  <span>50% — ×1.5</span>
                  <span>100% — ×2</span>
                  <span>200% — ×3</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Пример: 10 свободных агентов + {editForm.dialOverheadPct}% = {Math.ceil(10 * (1 + editForm.dialOverheadPct / 100))} наборов одновременно
                </p>
              </div>

              {/* dialTimeout + maxAttempts */}
              <div className="grid grid-cols-2 gap-3">
                <Input label="Таймаут дозвона (сек)" type="number" value={editForm.dialTimeout} onChange={e => setEditForm((p: any) => ({ ...p, dialTimeout: e.target.value }))} />
                <Input label="Макс. попыток на номер" type="number" value={editForm.maxAttempts} onChange={e => setEditForm((p: any) => ({ ...p, maxAttempts: e.target.value }))} />
              </div>

              {/* Retry toggle + interval */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Повторный набор недозвонов</span>
                  <button
                    type="button"
                    onClick={() => setEditForm((p: any) => ({ ...p, retryMissed: !p.retryMissed }))}
                    className={[
                      'relative inline-flex items-center flex-shrink-0 w-9 h-5 rounded-full transition-colors',
                      editForm.retryMissed ? 'bg-primary' : 'bg-border',
                    ].join(' ')}
                  >
                    <span className={[
                      'inline-block w-4 h-4 rounded-full bg-white shadow transition-transform',
                      editForm.retryMissed ? 'translate-x-[18px]' : 'translate-x-0.5',
                    ].join(' ')} />
                  </button>
                </div>
                {editForm.retryMissed && (
                  <Input label="Интервал повтора (мин)" type="number" value={editForm.retryInterval} onChange={e => setEditForm((p: any) => ({ ...p, retryInterval: e.target.value }))} />
                )}
              </div>

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

          {/* Allow inbound toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-accent/40 rounded-xl border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Приём входящих звонков</p>
              <p className="text-xs text-muted-foreground">Маршрутизировать входящие звонки на операторов этой кампании</p>
            </div>
            <button
              type="button"
              onClick={() => setEditForm((p: any) => ({ ...p, allowInbound: !p.allowInbound }))}
              className={['relative inline-flex h-6 w-11 rounded-full transition-colors',
                editForm.allowInbound ? 'bg-primary' : 'bg-muted'].join(' ')}
            >
              <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                editForm.allowInbound ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
            </button>
          </div>

          {/* General inbound fallback toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-violet-500/5 rounded-xl border border-violet-500/20">
            <div>
              <p className="text-sm font-medium text-foreground">Общая входящая кампания</p>
              <p className="text-xs text-muted-foreground">Принимает все входящие, для которых нет доступных операторов в других кампаниях</p>
            </div>
            <button
              type="button"
              onClick={() => setEditForm((p: any) => ({ ...p, isGeneralInbound: !p.isGeneralInbound }))}
              className={['relative inline-flex h-6 w-11 rounded-full transition-colors',
                editForm.isGeneralInbound ? 'bg-violet-500' : 'bg-muted'].join(' ')}
            >
              <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                editForm.isGeneralInbound ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
            </button>
          </div>

          {/* Inbound operators counter */}
          {(editForm.allowInbound || editForm.isGeneralInbound) && (() => {
            const inboundOps = (campaign as any).campaignTeams
              ?.flatMap((ct: any) => ct.team?.operators ?? [])
              ?.filter((op: any) => op.canReceiveInbound) ?? [];
            const readyOps = inboundOps.filter((op: any) => op.status === 'ACTIVE');
            return readyOps.length > 0 ? (
              <div className="flex items-center gap-2 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 px-3 py-2 rounded-lg">
                <PhoneIncoming size={12} />
                {readyOps.length} {readyOps.length === 1 ? 'оператор готов' : 'операторов готовы'} к приёму входящих
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 rounded-lg">
                <PhoneIncoming size={12} />
                Нет операторов с включённым приёмом входящих — настройте операторов команды
              </div>
            );
          })()}

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
