'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Upload, ExternalLink, Download, FileCheck, X, PlayCircle, StopCircle, Edit2, Lock, Unlock, Trash2, MoreHorizontal, PhoneOff, PhoneIncoming, PhoneCall } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { campaignsApi, providersApi, formsApi, teamsApi, scriptsApi, numbersApi, dialerApi, type Campaign, type Form } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Table, Thead, Tbody, Th, Tr, Td } from '@/components/ui/table';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { DropdownContent, DropdownItem, DropdownSeparator } from '@/components/ui/row-menu';
import { formatDate } from '@/lib/utils';

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

const EMPTY_FORM = {
  name: '', dialMode: 'PREDICTIVE', dialOverheadPct: 20, dialTimeout: 25,
  maxAttempts: 3, retryMissed: false, retryInterval: 60,
  timeFrom: '09:00', timeTo: '21:00',
  providerId: '', formId: '', scriptId: '', teamIds: [] as number[],
  forcedConnection: false, allowInbound: false, isGeneralInbound: false, acwTimeout: '',
};

interface CsvEntry { phone: string; data?: Record<string, string> }

// Parse CSV text → array of { phone, data? }
function parseCsv(text: string): CsvEntry[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const first = lines[0].split(',').map(h => h.trim());
  // Detect if first row is a header (contains non-phone-like value)
  const hasHeader = first.length > 1 || !/^\+?\d/.test(first[0]);

  if (!hasHeader || first.length === 1) {
    // Plain phone list
    return lines.map(l => ({ phone: l.split(',')[0].trim() })).filter(e => e.phone);
  }

  const headers = first;
  const phoneCol = headers.findIndex(h => /phone|телефон|номер|number/i.test(h)) ?? 0;
  const dataHeaders = headers.filter((_, i) => i !== phoneCol);

  return lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim());
    const phone = cells[phoneCol < 0 ? 0 : phoneCol] ?? '';
    const data: Record<string, string> = {};
    dataHeaders.forEach((h) => {
      const cellIdx = headers.indexOf(h);
      if (cells[cellIdx] !== undefined && cells[cellIdx] !== '') {
        data[h] = cells[cellIdx];
      }
    });
    return { phone, data: Object.keys(data).length > 0 ? data : undefined };
  }).filter(e => e.phone);
}

// Download a CSV template file
function downloadTemplate(formFields: { label: string }[]) {
  const labels = formFields.filter(f => f.label).map(f => f.label);
  const header = ['phone', ...labels].join(',');
  const example = ['+79991234567', ...labels.map(() => '')].join(',');
  const csv = [header, example].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'template.csv'; a.click();
  URL.revokeObjectURL(url);
}

const STATUS_FILTER_OPTS = [
  { value: 'ACTIVE',  label: 'Активные' },
  { value: 'STOPPED', label: 'Остановленные' },
  { value: 'BLOCKED', label: 'Заблокированные' },
  { value: 'all',     label: 'Все' },
];

function CampaignRowMenu({ c, onDelete }: { c: Campaign; onDelete: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirmStart, setConfirmStart] = useState(false);

  const isActive  = c.status === 'ACTIVE';
  const isBlocked = c.status === 'BLOCKED';

  const startDialer = useMutation({
    mutationFn: async () => {
      await campaignsApi.setStatus(c.id, 'ACTIVE');
      await dialerApi.start(c.id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast('Обзвон запущен', 'success'); setConfirmStart(false); },
    onError: () => { toast('Ошибка запуска', 'error'); setConfirmStart(false); },
  });

  const stopDialer = useMutation({
    mutationFn: async () => {
      await dialerApi.stop(c.id);
      await campaignsApi.setStatus(c.id, 'STOPPED');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast('Обзвон остановлен', 'success'); },
    onError: () => toast('Ошибка остановки', 'error'),
  });

  const blockCampaign = useMutation({
    mutationFn: async () => {
      await dialerApi.stop(c.id);
      await campaignsApi.setStatus(c.id, 'BLOCKED');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast('Кампания заблокирована', 'success'); },
    onError: () => toast('Ошибка', 'error'),
  });

  const unblockCampaign = useMutation({
    mutationFn: () => campaignsApi.setStatus(c.id, 'STOPPED'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast('Кампания разблокирована', 'success'); },
    onError: () => toast('Ошибка', 'error'),
  });

  return (
    <>
    {/* Confirmation dialog */}
    {confirmStart && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-card border border-border rounded-2xl p-6 w-80 shadow-2xl">
          <h3 className="text-base font-semibold text-foreground mb-2">Запустить обзвон?</h3>
          <p className="text-sm text-muted-foreground mb-5">
            Кампания <span className="text-foreground font-medium">«{c.name}»</span> будет активирована и начнётся автоматический набор.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => startDialer.mutate()}
              disabled={startDialer.isPending}
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-[#6b84ff] text-sm font-medium transition-colors disabled:opacity-50"
            >
              {startDialer.isPending ? 'Запуск...' : 'Да, запустить'}
            </button>
            <button
              onClick={() => setConfirmStart(false)}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    )}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none data-[state=open]:bg-accent data-[state=open]:text-foreground">
          <MoreHorizontal size={15} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownContent>
          {/* Start / Stop — недоступно для заблокированных */}
          {!isBlocked && (
            isActive ? (
              <DropdownItem icon={<StopCircle size={13} />} onClick={() => stopDialer.mutate()} variant="danger">
                Остановить обзвон
              </DropdownItem>
            ) : (
              <DropdownItem icon={<PlayCircle size={13} />} onClick={() => setConfirmStart(true)}>
                Запустить обзвон
              </DropdownItem>
            )
          )}
          <DropdownSeparator />
          <DropdownItem icon={<Edit2 size={13} />} onClick={() => router.push(`/admin/campaigns/${c.id}`)}>
            Редактировать
          </DropdownItem>
          <DropdownItem icon={<Plus size={13} />} onClick={() => router.push(`/admin/campaigns/${c.id}`)}>
            Добавить номера
          </DropdownItem>
          <DropdownItem icon={<PhoneOff size={13} />} onClick={() => router.push(`/admin/campaigns/${c.id}`)}>
            Удалить номера
          </DropdownItem>
          <DropdownSeparator />
          {/* Block / Unblock */}
          {isBlocked ? (
            <DropdownItem icon={<Unlock size={13} />} onClick={() => unblockCampaign.mutate()}>
              Разблокировать
            </DropdownItem>
          ) : (
            <DropdownItem icon={<Lock size={13} />} onClick={() => blockCampaign.mutate()} variant="danger">
              Заблокировать
            </DropdownItem>
          )}
          <DropdownSeparator />
          <DropdownItem variant="danger" icon={<Trash2 size={13} />} onClick={onDelete}>
            Удалить
          </DropdownItem>
        </DropdownContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    </>
  );
}

export default function CampaignsPage() {
  useRequirePermission('CAMPAIGNS_VIEW');
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE');
  const { toast } = useToast();
  const { can } = useAuth();
  const canManage = can('CAMPAIGNS_MANAGE');
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [csvEntries, setCsvEntries] = useState<CsvEntry[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({ queryKey: ['campaigns'], queryFn: campaignsApi.getAll });
  const { data: providers = [] } = useQuery({ queryKey: ['providers'], queryFn: providersApi.getAll });
  const { data: forms = [] } = useQuery<Form[]>({ queryKey: ['forms'], queryFn: formsApi.getAll });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.getAll });
  const { data: scripts = [] } = useQuery({ queryKey: ['scripts'], queryFn: scriptsApi.getAll });

  // Find selected form's fields for template generation
  const selectedForm = forms.find((f: Form) => String(f.id) === form.formId);
  const formFields = selectedForm?.fields?.filter(f => f.label && f.type !== 'RESULT') ?? [];

  const filteredCampaigns = campaigns.filter(c => statusFilter === 'all' || c.status === statusFilter);

  const create = useMutation({
    mutationFn: async () => {
      const campaign = await campaignsApi.create({
        ...form,
        dialOverheadPct: Number(form.dialOverheadPct),
        dialTimeout: Number(form.dialTimeout),
        maxAttempts: Number(form.maxAttempts),
        retryMissed: form.retryMissed,
        retryInterval: Number(form.retryInterval),
        providerId: form.providerId ? Number(form.providerId) : undefined,
        formId: form.formId ? Number(form.formId) : undefined,
        scriptId: form.scriptId ? Number(form.scriptId) : undefined,
        teamIds: form.teamIds,
        forcedConnection: form.forcedConnection,
        allowInbound: form.allowInbound,
        isGeneralInbound: form.isGeneralInbound,
        acwTimeout: form.acwTimeout ? Number(form.acwTimeout) : null,
      });
      // Upload CSV numbers if any
      if (csvEntries.length > 0) {
        await numbersApi.addWithData(campaign.id, csvEntries);
      }
      return campaign;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['campaigns'] });
      toast('Кампания создана', 'success');
      setShowCreate(false);
      setForm({ ...EMPTY_FORM });
      setCsvEntries([]);
      setCsvFileName('');
    },
    onError: () => toast('Ошибка при создании', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => campaignsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast('Кампания удалена', 'success'); },
  });

  const toggleTeam = (id: number) =>
    setForm(p => ({ ...p, teamIds: p.teamIds.includes(id) ? p.teamIds.filter(t => t !== id) : [...p.teamIds, id] }));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_SIZE) {
      toast(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум 5 МБ.`, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const entries = parseCsv(text);
      setCsvEntries(entries);
      toast(`Загружено ${entries.length} номеров`, 'success');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const clearFile = () => {
    setCsvEntries([]);
    setCsvFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Кампании</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Управление обзвонами</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={15} /> Создать кампанию
          </Button>
        )}
      </div>

      {/* Create modal */}
      <Modal open={canManage && showCreate} onClose={() => setShowCreate(false)} title="Новая кампания" width="w-[600px]">
        <div className="flex flex-col gap-5">
          <Input label="Название кампании *" placeholder="Продажи Q3 2026" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />

          <div>
            <p className="text-xs text-muted-foreground mb-2">Режим обзвона</p>
            <div className="grid grid-cols-3 gap-3">
              {DIAL_OPTS.map(o => (
                <button key={o.value} onClick={() => setForm(p => ({ ...p, dialMode: o.value }))}
                  className={['p-3 rounded-xl border text-left transition-all', form.dialMode === o.value ? 'border-primary bg-primary/15' : 'border-border hover:border-primary'].join(' ')}>
                  <div className="font-semibold text-sm text-foreground">{o.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{o.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {form.dialMode === 'PREDICTIVE' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Оверхед набора</span>
                <span className="text-sm font-semibold text-foreground">
                  {form.dialOverheadPct}%
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (× {(1 + form.dialOverheadPct / 100).toFixed(2)})
                  </span>
                </span>
              </div>
              <input
                type="range" min={0} max={200} step={5}
                value={form.dialOverheadPct}
                onChange={e => setForm(p => ({ ...p, dialOverheadPct: Number(e.target.value) }))}
                className="w-full accent-primary h-1.5 rounded-full cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0%</span><span>50%</span><span>100%</span><span>150%</span><span>200%</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-1">
                <Input label="Таймаут дозвона (сек)" type="number" value={form.dialTimeout} onChange={e => setForm(p => ({ ...p, dialTimeout: Number(e.target.value) }))} />
                <Input label="Макс. попыток на номер" type="number" value={form.maxAttempts} onChange={e => setForm(p => ({ ...p, maxAttempts: Number(e.target.value) }))} />
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Повторный набор недозвонов</span>
                <button
                  type="button"
                  onClick={() => setForm(p => ({ ...p, retryMissed: !p.retryMissed }))}
                  className={['relative inline-flex items-center flex-shrink-0 w-9 h-5 rounded-full transition-colors', form.retryMissed ? 'bg-primary' : 'bg-border'].join(' ')}
                >
                  <span className={['inline-block w-4 h-4 rounded-full bg-white shadow transition-transform', form.retryMissed ? 'translate-x-[18px]' : 'translate-x-0.5'].join(' ')} />
                </button>
              </div>
              {form.retryMissed && (
                <Input label="Интервал повтора (мин)" type="number" value={form.retryInterval} onChange={e => setForm(p => ({ ...p, retryInterval: Number(e.target.value) }))} />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Начало работы" type="time" value={form.timeFrom} onChange={e => setForm(p => ({ ...p, timeFrom: e.target.value }))} />
            <Input label="Конец работы" type="time" value={form.timeTo} onChange={e => setForm(p => ({ ...p, timeTo: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Провайдер" value={form.providerId} onChange={e => setForm(p => ({ ...p, providerId: e.target.value }))}>
              <option value="">— Выбрать провайдер —</option>
              {providers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Select label="Форма оператора" value={form.formId} onChange={e => setForm(p => ({ ...p, formId: e.target.value }))}>
              <option value="">— Без формы —</option>
              {forms.map((f: Form) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>

          <Select label="Скрипт звонка" value={form.scriptId} onChange={e => setForm(p => ({ ...p, scriptId: e.target.value }))}>
            <option value="">— Без скрипта —</option>
            {(scripts as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>

          <div className="flex items-center justify-between py-2 px-3 bg-accent/40 rounded-xl border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Принудительное соединение</p>
              <p className="text-xs text-muted-foreground">Звонок сразу соединяет оператора без кнопки "Ответить"</p>
            </div>
            <button type="button" onClick={() => setForm(p => ({ ...p, forcedConnection: !p.forcedConnection }))}
              className={['relative inline-flex h-6 w-11 rounded-full transition-colors', form.forcedConnection ? 'bg-primary' : 'bg-muted'].join(' ')}>
              <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', form.forcedConnection ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
            </button>
          </div>

          <div className="flex items-center justify-between py-2 px-3 bg-accent/40 rounded-xl border border-border">
            <div>
              <p className="text-sm font-medium text-foreground">Приём входящих звонков</p>
              <p className="text-xs text-muted-foreground">Маршрутизировать входящие звонки на операторов этой кампании</p>
            </div>
            <button type="button" onClick={() => setForm(p => ({ ...p, allowInbound: !p.allowInbound }))}
              className={['relative inline-flex h-6 w-11 rounded-full transition-colors', form.allowInbound ? 'bg-primary' : 'bg-muted'].join(' ')}>
              <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', form.allowInbound ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
            </button>
          </div>

          <div className="flex items-center justify-between py-2 px-3 bg-violet-500/5 rounded-xl border border-violet-500/20">
            <div>
              <p className="text-sm font-medium text-foreground">Общая входящая кампания</p>
              <p className="text-xs text-muted-foreground">Принимает все входящие звонки, для которых нет доступных операторов в других кампаниях</p>
            </div>
            <button type="button" onClick={() => setForm(p => ({ ...p, isGeneralInbound: !p.isGeneralInbound }))}
              className={['relative inline-flex h-6 w-11 rounded-full transition-colors', form.isGeneralInbound ? 'bg-violet-500' : 'bg-muted'].join(' ')}>
              <span className={['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', form.isGeneralInbound ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
            </button>
          </div>

          <Select label="Таймаут ACW (после звонка)" value={form.acwTimeout} onChange={e => setForm(p => ({ ...p, acwTimeout: e.target.value }))}>
            {ACW_TIMEOUT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Команды</p>
            <div className="flex flex-wrap gap-2">
              {teams.map((t: any) => (
                <label key={t.id} className={['flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-all', form.teamIds.includes(t.id) ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:border-primary'].join(' ')}>
                  <input type="checkbox" className="sr-only" checked={form.teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                  {t.name}
                </label>
              ))}
              {teams.length === 0 && <p className="text-xs text-muted-foreground">Сначала создайте команды</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">База номеров (CSV)</p>
              {formFields.length > 0 && (
                <button onClick={() => downloadTemplate(formFields)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
                  <Download size={12} /> Скачать шаблон
                </button>
              )}
            </div>
            {csvFileName ? (
              <div className="flex items-center gap-3 border border-border rounded-xl px-4 py-3 bg-muted/20">
                <FileCheck size={18} className="text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{csvFileName}</p>
                  <p className="text-xs text-muted-foreground">{csvEntries.length} номеров загружено</p>
                </div>
                <button onClick={clearFile} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary transition-colors text-muted-foreground">
                <Upload size={22} />
                <span className="text-sm">Перетащите файл или <span className="text-primary">выберите</span></span>
                <span className="text-xs">.csv — до 5 МБ</span>
                <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleFileChange} />
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button loading={create.isPending} disabled={!form.name.trim()} onClick={() => create.mutate()}>Создать кампанию</Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Отмена</Button>
          </div>
        </div>
      </Modal>

      {/* Status filter */}
      <div className="flex items-center gap-3 mb-4">
        {STATUS_FILTER_OPTS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={['px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              statusFilter === opt.value
                ? 'bg-primary/10 text-primary border-primary/40'
                : 'text-muted-foreground border-border hover:text-foreground hover:border-border/80',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <Thead><tr>
            <Th>ID</Th><Th>Кампания</Th><Th>Режим</Th><Th>Провайдер</Th><Th>Команды</Th>
            <Th>Номеров</Th><Th>Дата</Th><Th>Статус</Th>{canManage && <Th />}
          </tr></Thead>
          <Tbody>
            {!isLoading && filteredCampaigns.length === 0 && (
              <Tr><Td className="text-center text-muted-foreground py-10" colSpan={9}>Кампаний пока нет</Td></Tr>
            )}
            {filteredCampaigns.map(c => (
              <Tr key={c.id}>
                <Td className="font-mono text-xs text-muted-foreground w-10">#{c.id}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{c.name}</span>
                        {c.isGeneralInbound && (
                          <span title="Общая входящая кампания" className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-medium">
                            <PhoneCall size={9} /> Общая вх.
                          </span>
                        )}
                        {c.allowInbound && !c.isGeneralInbound && (
                          <span title="Принимает входящие" className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium">
                            <PhoneIncoming size={9} /> Вх.
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{c.form?.name ?? '—'}</div>
                    </div>
                    {canManage && (
                      <Link href={`/admin/campaigns/${c.id}`} className="text-muted-foreground hover:text-primary transition-colors ml-1">
                        <ExternalLink size={13} />
                      </Link>
                    )}
                  </div>
                </Td>
                <Td>
                  <Badge variant="blue">
                    {c.dialMode === 'PREDICTIVE' ? `Предиктив +${c.dialOverheadPct}%` : c.dialMode === 'PROGRESSIVE' ? 'Прогрессив' : 'Ручной'}
                  </Badge>
                </Td>
                <Td>{c.provider?.name ?? <span className="text-muted-foreground">—</span>}</Td>
                <Td className="text-sm text-muted-foreground">{c.campaignTeams?.map(ct => ct.team.name).join(', ') || '—'}</Td>
                <Td>{c._count?.numbers ?? 0}</Td>
                <Td className="text-muted-foreground">{formatDate(c.createdAt)}</Td>
                <Td><StatusBadge status={c.status} /></Td>
                {canManage && <Td><CampaignRowMenu c={c} onDelete={() => { if (confirm(`Удалить «${c.name}»?`)) remove.mutate(c.id); }} /></Td>}
              </Tr>
            ))}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}
