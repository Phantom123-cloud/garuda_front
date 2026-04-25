'use client';
import { useState } from 'react';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, Save, Trash2, X, FileText, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface ScriptStep {
  order: number;
  title: string;
  content: string;
  hint?: string;
}

interface Script {
  id: number;
  name: string;
  description?: string;
  status: 'ACTIVE' | 'BLOCKED';
  createdAt: string;
  steps: (ScriptStep & { id?: number })[];
  _count?: { campaigns: number };
}

const scriptsApi = {
  getAll: () => api.get('/scripts').then(r => r.data),
  getOne: (id: number) => api.get(`/scripts/${id}`).then(r => r.data),
  create: (data: any) => api.post('/scripts', data).then(r => r.data),
  update: (id: number, data: any) => api.patch(`/scripts/${id}`, data).then(r => r.data),
  toggleStatus: (id: number) => api.patch(`/scripts/${id}/toggle-status`).then(r => r.data),
  remove: (id: number) => api.delete(`/scripts/${id}`),
};

let stepKey = 0;
const newStepKey = () => `sk_${++stepKey}`;

interface LocalStep extends ScriptStep { _key: string }

function makeStep(order: number): LocalStep {
  return { _key: newStepKey(), order, title: '', content: '', hint: '' };
}

export default function ScriptsPage() {
  useRequirePermission('SCRIPTS_MANAGE');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: scripts = [] } = useQuery<Script[]>({ queryKey: ['scripts'], queryFn: scriptsApi.getAll });

  const [active, setActive] = useState<Script | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<LocalStep[]>([]);

  const openScript = (s: Script) => {
    setActive(s); setIsNew(false);
    setName(s.name); setDescription(s.description ?? '');
    setSteps(s.steps.map(st => ({ ...st, _key: newStepKey() })));
  };

  const startNew = () => {
    setActive(null); setIsNew(true);
    setName(''); setDescription('');
    setSteps([makeStep(0)]);
  };

  const addStep = () => setSteps(p => [...p, makeStep(p.length)]);
  const removeStep = (key: string) => setSteps(p => p.filter(s => s._key !== key).map((s, i) => ({ ...s, order: i })));
  const updateStep = (key: string, patch: Partial<LocalStep>) => setSteps(p => p.map(s => s._key === key ? { ...s, ...patch } : s));

  const payload = () => ({
    name,
    description: description || undefined,
    steps: steps.map((s, i) => ({ order: i, title: s.title, content: s.content, hint: s.hint || undefined })),
  });

  const create = useMutation({
    mutationFn: () => scriptsApi.create(payload()),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['scripts'] }); toast('Скрипт создан', 'success'); setIsNew(false); setActive(data); },
    onError: () => toast('Ошибка', 'error'),
  });

  const update = useMutation({
    mutationFn: () => scriptsApi.update(active!.id, payload()),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['scripts'] }); toast('Скрипт сохранён', 'success'); setActive(data as any); },
    onError: () => toast('Ошибка', 'error'),
  });

  const toggleStatus = useMutation({
    mutationFn: (id: number) => scriptsApi.toggleStatus(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scripts'] }); toast('Статус обновлён', 'success'); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => scriptsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['scripts'] }); toast('Скрипт удалён', 'success'); setActive(null); setIsNew(false); },
  });

  const isEditing = isNew || active;

  // suppress unused warning
  void toggleStatus;
  void formatDate;

  return (
    <div className="p-6 flex gap-5 h-[calc(100vh-0px)]">
      {/* List */}
      <div className="w-64 flex flex-col flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-semibold text-foreground">Скрипты</h1>
          <Button size="sm" onClick={startNew}><Plus size={13} /> Новый</Button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {scripts.map(s => (
            <button key={s.id} onClick={() => openScript(s)}
              className={['flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left transition-all group', active?.id === s.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'].join(' ')}>
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{s.name}</div>
                <div className="text-[11px] text-muted-foreground/60 mt-0.5">{s.steps?.length ?? 0} шагов · {s._count?.campaigns ?? 0} кампаний</div>
              </div>
              <ChevronRight size={13} className="flex-shrink-0 opacity-40" />
            </button>
          ))}
          {!scripts.length && <p className="text-xs text-muted-foreground px-2 py-4">Скриптов пока нет</p>}
        </div>
      </div>

      {/* Empty state */}
      {!isEditing && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <FileText size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">Выберите скрипт или создайте новый</p>
          </div>
        </div>
      )}

      {/* Editor */}
      {isEditing && (
        <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden min-h-0">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <div className="flex-1 flex gap-3">
              <Input placeholder="Название скрипта..." value={name} onChange={e => setName(e.target.value)} className="flex-1" />
              <Input placeholder="Описание (необязательно)" value={description} onChange={e => setDescription(e.target.value)} className="flex-1" />
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {active && (
                <Button variant="danger" size="sm" onClick={() => { if (confirm('Удалить скрипт?')) remove.mutate(active.id); }}>
                  <Trash2 size={14} />
                </Button>
              )}
              <Button size="sm" loading={create.isPending || update.isPending} disabled={!name.trim() || steps.every(s => !s.title)}
                onClick={() => isNew ? create.mutate() : update.mutate()}>
                <Save size={14} /> Сохранить
              </Button>
            </div>
          </div>

          {/* Steps */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {steps.map((step, idx) => (
              <div key={step._key} className="bg-background border border-border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center border border-primary/20">
                      {idx + 1}
                    </span>
                  </div>
                  <div className="flex-1 space-y-2">
                    <input value={step.title} onChange={e => updateStep(step._key, { title: e.target.value })}
                      placeholder="Заголовок шага (напр. «Приветствие»)"
                      className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground border-b border-border pb-1 focus:border-primary transition-colors" />
                    <textarea value={step.content} onChange={e => updateStep(step._key, { content: e.target.value })}
                      placeholder="Текст для оператора (что говорить клиенту)..."
                      rows={3}
                      className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <Lightbulb size={13} className="text-yellow-400 flex-shrink-0" />
                      <input value={step.hint ?? ''} onChange={e => updateStep(step._key, { hint: e.target.value })}
                        placeholder="Подсказка (необязательно, видна только оператору)"
                        className="flex-1 bg-transparent text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/50" />
                    </div>
                  </div>
                  <button onClick={() => removeStep(step._key)} className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 mt-1">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button onClick={addStep}
              className="w-full py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground text-sm hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
              <Plus size={14} /> Добавить шаг
            </button>
          </div>
          {/* Footer count */}
          <div className="px-5 py-2.5 border-t border-border text-xs text-muted-foreground">
            {steps.length} шагов
          </div>
        </div>
      )}
    </div>
  );
}
