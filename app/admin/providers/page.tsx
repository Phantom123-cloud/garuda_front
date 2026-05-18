'use client';
import { useState, useRef, KeyboardEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Plug, Radio, Network, X, Phone } from 'lucide-react';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { providersApi, type Provider, type ProviderType } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { RowMenu } from '@/components/ui/row-menu';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_TYPES: { value: ProviderType; label: string; desc: string }[] = [
  { value: 'SIP_REGISTRATION', label: 'SIP Регистрация', desc: 'Регистрация у провайдера по логину/паролю' },
  { value: 'SIP_PEER',         label: 'SIP Peer',        desc: 'Без регистрации, авторизация по IP или учётным данным' },
  { value: 'IAX2',             label: 'IAX2',            desc: 'Протокол IAX2, связь между Asterisk-серверами' },
];

const TYPE_LABELS: Record<ProviderType, string> = {
  SIP_REGISTRATION: 'SIP Reg',
  SIP_PEER: 'SIP Peer',
  IAX2: 'IAX2',
};

const TYPE_COLORS: Record<ProviderType, string> = {
  SIP_REGISTRATION: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  SIP_PEER:         'bg-violet-500/10 text-violet-400 border-violet-500/20',
  IAX2:             'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

const DEFAULT_PORT: Record<ProviderType, number> = {
  SIP_REGISTRATION: 5060,
  SIP_PEER: 5060,
  IAX2: 4569,
};

function mkEmpty(type: ProviderType = 'SIP_REGISTRATION') {
  return { type, name: '', host: '', port: DEFAULT_PORT[type], login: '', password: '', transport: 'UDP', maxChannels: 30, callerIds: [] as string[] };
}
type FormState = ReturnType<typeof mkEmpty>;

// ─── Tabs ────────────────────────────────────────────────────────────────────

type Tab = 'connection' | 'aon';

function Tabs({ active, onChange, aonCount }: { active: Tab; onChange: (t: Tab) => void; aonCount: number }) {
  return (
    <div className="flex gap-1 p-1 bg-muted/40 rounded-lg border border-border">
      {([
        { id: 'connection', label: 'Подключение' },
        { id: 'aon',        label: `Пул АОН${aonCount > 0 ? ` (${aonCount})` : ''}` },
      ] as { id: Tab; label: string }[]).map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            'flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all',
            active === t.id
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Type selector ────────────────────────────────────────────────────────────

function TypeSelector({ value, onChange }: { value: ProviderType; onChange: (t: ProviderType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {PROVIDER_TYPES.map(t => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-lg border text-left transition-all',
            value === t.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          <span className="text-[12px] font-semibold">{t.label}</span>
          <span className="text-[10px] leading-tight opacity-70">{t.desc}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Caller ID tag input ──────────────────────────────────────────────────────

function CallerIdsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || value.includes(trimmed)) { setInput(''); return; }
    onChange([...value, trimmed]);
    setInput('');
  };

  const remove = (num: string) => onChange(value.filter(v => v !== num));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
    if (e.key === 'Backspace' && !input && value.length) remove(value[value.length - 1]);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">Добавить номер</label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="+74951234567"
            className="flex-1 h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors font-mono"
          />
          <Button type="button" variant="secondary" onClick={add} disabled={!input.trim()}>
            <Plus size={14} /> Добавить
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Или нажмите Enter прямо в поле. При нескольких номерах — равномерная ротация по кругу.
        </p>
      </div>

      {/* Number list */}
      {value.length > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-medium text-muted-foreground">
              {value.length} {value.length === 1 ? 'номер' : value.length < 5 ? 'номера' : 'номеров'}
            </span>
            {value.length > 1 && (
              <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
                round-robin
              </span>
            )}
          </div>
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
            {value.map((num, i) => (
              <div
                key={num}
                className={cn(
                  'flex items-center justify-between px-3 py-2 group',
                  i !== value.length - 1 && 'border-b border-border',
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-sm font-mono text-foreground">{num}</span>
                  {i === 0 && value.length > 1 && (
                    <span className="text-[10px] text-muted-foreground">(первым)</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(num)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-border text-muted-foreground gap-2">
          <Phone size={20} className="opacity-40" />
          <p className="text-sm">Пул пустой</p>
          <p className="text-xs opacity-60">Добавьте хотя бы один номер АОН</p>
        </div>
      )}
    </div>
  );
}

// ─── Connection form ──────────────────────────────────────────────────────────

function ConnectionForm({ form, onChange, isEdit = false }: { form: FormState; onChange: (f: FormState) => void; isEdit?: boolean }) {
  const set = (field: keyof FormState, val: any) => onChange({ ...form, [field]: val });
  const inp = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    set(field, e.target.value);

  const loginRequired = form.type === 'SIP_REGISTRATION';
  const showTransport = form.type === 'SIP_REGISTRATION' || form.type === 'SIP_PEER';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground mb-2">Тип подключения</p>
        <TypeSelector value={form.type} onChange={t => onChange({ ...form, type: t, port: DEFAULT_PORT[t] })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Название" placeholder="Zadarma RU" value={form.name} onChange={inp('name')} />
        <Input label="Хост / домен" placeholder="sip.provider.ru" value={form.host} onChange={inp('host')} />
      </div>

      <div className={cn('grid gap-3', showTransport ? 'grid-cols-3' : 'grid-cols-2')}>
        <Input
          label={`Логин${loginRequired ? '' : ' (опционально)'}`}
          placeholder="username"
          value={form.login}
          onChange={inp('login')}
        />
        <Input
          label={isEdit ? 'Пароль (пусто = не менять)' : `Пароль${loginRequired ? '' : ' (опционально)'}`}
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={inp('password')}
        />
        {showTransport && (
          <Select label="Транспорт" value={form.transport} onChange={inp('transport')}>
            <option>UDP</option><option>TCP</option><option>TLS</option>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input label="Порт" type="number" value={form.port} onChange={inp('port')} />
        <Input label="Макс. каналов" type="number" value={form.maxChannels} onChange={inp('maxChannels')} />
      </div>
    </div>
  );
}

// ─── Modal with tabs ──────────────────────────────────────────────────────────

function ProviderModal({
  open, onClose, title, form, onChange, onSubmit, loading, isEdit,
}: {
  open: boolean; onClose: () => void; title: string;
  form: FormState; onChange: (f: FormState) => void;
  onSubmit: () => void; loading: boolean; isEdit?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('connection');

  return (
    <Modal open={open} onClose={onClose} title={title} width="w-[580px]">
      <div className="flex flex-col gap-4">
        <Tabs active={tab} onChange={setTab} aonCount={form.callerIds.length} />

        {tab === 'connection' && (
          <ConnectionForm form={form} onChange={onChange} isEdit={isEdit} />
        )}
        {tab === 'aon' && (
          <CallerIdsInput value={form.callerIds} onChange={v => onChange({ ...form, callerIds: v })} />
        )}

        {isEdit && (
          <p className="text-xs text-muted-foreground">
            После сохранения конфигурация автоматически применится в Asterisk.
          </p>
        )}
        <div className="flex gap-3 pt-1">
          <Button loading={loading} disabled={!form.name.trim() || !form.host.trim()} onClick={onSubmit}>
            {isEdit ? 'Сохранить' : 'Добавить'}
          </Button>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProvidersPage() {
  useRequirePermission('PROVIDERS_MANAGE');
  const { toast } = useToast();
  const qc = useQueryClient();

  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState<FormState>(mkEmpty());
  const [editModal, setEditModal] = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [editForm, setEditForm]   = useState<FormState>(mkEmpty());

  const { data: providers = [] } = useQuery<Provider[]>({ queryKey: ['providers'], queryFn: providersApi.getAll });

  const buildPayload = (f: FormState, keepPassword = true) => ({
    type: f.type, name: f.name, host: f.host,
    port: Number(f.port),
    login: f.login || undefined,
    ...(keepPassword && f.password ? { password: f.password } : {}),
    transport: f.type === 'IAX2' ? undefined : f.transport,
    maxChannels: Number(f.maxChannels),
    callerIds: f.callerIds,
  });

  const create = useMutation({
    mutationFn: () => providersApi.create(buildPayload(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
      toast('Провайдер добавлен и синхронизирован с Asterisk', 'success');
      setModal(false); setForm(mkEmpty());
    },
    onError: () => toast('Ошибка при создании', 'error'),
  });

  const update = useMutation({
    mutationFn: () => providersApi.update(editId!, buildPayload(editForm)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['providers'] });
      toast('Провайдер обновлён и синхронизирован с Asterisk', 'success');
      setEditModal(false);
    },
    onError: () => toast('Ошибка при обновлении', 'error'),
  });

  const toggle = useMutation({
    mutationFn: (id: number) => providersApi.toggleStatus(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); toast('Статус обновлён', 'success'); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => providersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['providers'] }); toast('Провайдер удалён', 'success'); },
  });

  const openEdit = (p: Provider) => {
    setEditId(p.id);
    setEditForm({
      type: p.type, name: p.name, host: p.host, port: p.port,
      login: p.login ?? '', password: '',
      transport: p.transport ?? 'UDP', maxChannels: p.maxChannels ?? 30,
      callerIds: p.callerIds ?? [],
    });
    setEditModal(true);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Провайдеры</h1>
          <p className="text-sm text-muted-foreground mt-0.5">SIP Registration · SIP Peer · IAX2</p>
        </div>
        <Button onClick={() => { setForm(mkEmpty()); setModal(true); }}>
          <Plus size={15} /> Добавить провайдер
        </Button>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {providers.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground">
            Провайдеров нет. Добавьте подключение для совершения звонков.
          </div>
        )}
        {providers.map(p => (
          <div key={p.id} className="bg-card border border-border rounded-xl p-5 hover:border-primary transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                  {p.type === 'IAX2' ? <Radio size={18} /> : p.type === 'SIP_PEER' ? <Network size={18} /> : <Plug size={18} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{p.name}</span>
                    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', TYPE_COLORS[p.type])}>
                      {TYPE_LABELS[p.type]}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {p.host}:{p.port}{p.type !== 'IAX2' && ` · ${p.transport}`}
                    {p.login && ` · ${p.login}`}
                    {` · ${p.maxChannels} тр.`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={p.status} />
                <RowMenu
                  status={p.status}
                  onEdit={() => openEdit(p)}
                  onToggle={() => toggle.mutate(p.id)}
                  onDelete={() => { if (confirm(`Удалить провайдер «${p.name}»?`)) remove.mutate(p.id); }}
                  deleteLabel="Удалить провайдер"
                />
              </div>
            </div>

            {/* CallerIDs pool */}
            {p.callerIds.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="flex items-center gap-2 mb-2">
                  <Phone size={11} className="text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Пул АОН
                    {p.callerIds.length > 1 && (
                      <span className="ml-1.5 text-primary bg-primary/10 border border-primary/20 rounded px-1 py-0.5 text-[10px]">
                        round-robin
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {p.callerIds.map((num, i) => (
                    <span
                      key={num}
                      className="flex items-center gap-1 text-[11px] font-mono bg-muted/50 text-foreground border border-border rounded px-2 py-0.5"
                    >
                      <span className="text-muted-foreground text-[9px]">{i + 1}.</span>
                      {num}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <ProviderModal
        open={modal}
        onClose={() => setModal(false)}
        title="Добавить провайдер"
        form={form}
        onChange={setForm}
        onSubmit={() => create.mutate()}
        loading={create.isPending}
      />

      <ProviderModal
        open={editModal}
        onClose={() => setEditModal(false)}
        title="Редактировать провайдер"
        form={editForm}
        onChange={setEditForm}
        onSubmit={() => update.mutate()}
        loading={update.isPending}
        isEdit
      />
    </div>
  );
}
