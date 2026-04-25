'use client';
import { useState, useCallback } from 'react';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Trash2, GripVertical, Save, ChevronRight, X } from 'lucide-react';
import { formsApi, type Form, type FormField } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

type FieldType = FormField['type'];

const FIELD_TYPES: { type: FieldType; label: string; icon: string; desc: string }[] = [
  { type: 'STRING',        label: 'Строка',             icon: '📝', desc: 'Однострочное текстовое поле' },
  { type: 'NUMBER',        label: 'Число',              icon: '🔢', desc: 'Числовое поле' },
  { type: 'NOTE',          label: 'Заметка',            icon: '📋', desc: 'Многострочный текст (textarea)' },
  { type: 'CHECKBOX',      label: 'Чекбокс',            icon: '☑️', desc: 'Флажок да/нет' },
  { type: 'DATE_EVENT',    label: 'Календарь события',  icon: '📅', desc: 'Дата и время события' },
  { type: 'DATE_CALLBACK', label: 'Календарь перезвона',icon: '🔁', desc: 'Запланировать перезвон' },
  { type: 'DROPDOWN',      label: 'Выпадающий список',  icon: '📋', desc: 'Список с вариантами' },
  { type: 'RESULT',        label: 'Результат звонка',   icon: '🎯', desc: 'Итог с типами результата' },
];

const RESULT_TYPES = [
  { value: 'MISSED',    label: 'Недозвон',      color: 'text-muted-foreground' },
  { value: 'VOICEMAIL', label: 'Автоответчик',  color: 'text-yellow-400' },
  { value: 'REFUSE',    label: 'Отказ',         color: 'text-red-400' },
  { value: 'AGREE',     label: 'Согласие',      color: 'text-green-400' },
  { value: 'CALLBACK',  label: 'Перезвон',      color: 'text-blue-400' },
];

interface LocalField {
  _key: string;
  label: string;
  type: FieldType;
  order: number;
  required: boolean;
  config?: any;
}

let keySeq = 0;
const newKey = () => `f_${++keySeq}`;

function makeField(type: FieldType, order: number): LocalField {
  const base = { _key: newKey(), type, order, required: false, label: '' };
  if (type === 'DROPDOWN') return { ...base, config: { options: [''] } };
  if (type === 'RESULT')   return { ...base, config: { results: [{ label: 'Результат 1', type: 'AGREE' }] } };
  return base;
}

export default function FormsPage() {
  useRequirePermission('FORMS_MANAGE');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: forms = [] } = useQuery<Form[]>({ queryKey: ['forms'], queryFn: formsApi.getAll });

  const [activeForm, setActiveForm] = useState<Form | null>(null);
  const [formName, setFormName] = useState('');
  const [fields, setFields] = useState<LocalField[]>([]);
  const [creatingNew, setCreatingNew] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openForm = (f: Form) => {
    setActiveForm(f);
    setFormName(f.name);
    setCreatingNew(false);
    setFields(f.fields.map((ff, i) => ({ _key: newKey(), label: ff.label, type: ff.type, order: ff.order, required: ff.required, config: ff.config })));
  };

  const startNew = () => {
    setActiveForm(null);
    setFormName('');
    setFields([]);
    setCreatingNew(true);
  };

  const addField = (type: FieldType) => {
    setFields(prev => [...prev, makeField(type, prev.length)]);
  };

  const removeField = (key: string) => setFields(prev => prev.filter(f => f._key !== key));
  const updateField = (key: string, patch: Partial<LocalField>) =>
    setFields(prev => prev.map(f => f._key === key ? { ...f, ...patch } : f));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setFields(prev => {
      const oldIdx = prev.findIndex(f => f._key === active.id);
      const newIdx = prev.findIndex(f => f._key === over.id);
      return arrayMove(prev, oldIdx, newIdx).map((f, i) => ({ ...f, order: i }));
    });
  };

  const savePayload = useCallback(() => ({
    name: formName,
    fields: fields.map((f, i) => ({ label: f.label, type: f.type, order: i, required: f.required, config: f.config ?? null })),
  }), [formName, fields]);

  const create = useMutation({
    mutationFn: () => formsApi.create(savePayload()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['forms'] });
      toast('Форма создана', 'success');
      setCreatingNew(false);
      setActiveForm(data);
    },
    onError: () => toast('Ошибка', 'error'),
  });

  const update = useMutation({
    mutationFn: () => formsApi.update(activeForm!.id, savePayload()),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['forms'] });
      toast('Форма сохранена', 'success');
      setActiveForm(data as any);
    },
    onError: () => toast('Ошибка', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => formsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forms'] });
      toast('Форма удалена', 'success');
      setActiveForm(null); setCreatingNew(false);
    },
  });

  const isEditing = creatingNew || activeForm;

  return (
    <div className="p-6 flex gap-5 h-[calc(100vh-0px)]">
      {/* Left: form list */}
      <div className="w-64 flex flex-col flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-base font-semibold text-foreground">Формы</h1>
          <Button size="sm" onClick={startNew}><Plus size={13} /> Новая</Button>
        </div>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {forms.map(f => (
            <button key={f.id} onClick={() => openForm(f)}
              className={['flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left transition-all', activeForm?.id === f.id ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'].join(' ')}>
              <span className="truncate">{f.name}</span>
              <ChevronRight size={14} className="flex-shrink-0 opacity-50" />
            </button>
          ))}
          {!forms.length && <p className="text-xs text-muted-foreground px-2 py-4">Форм пока нет</p>}
        </div>
      </div>

      {/* Right: editor */}
      {!isEditing && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="text-4xl mb-3">📝</div>
            <p>Выберите форму или создайте новую</p>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="flex-1 flex gap-5 min-h-0">
          {/* Field palette */}
          <div className="w-56 flex-shrink-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Тип поля</p>
            <div className="flex flex-col gap-1.5">
              {FIELD_TYPES.map(ft => (
                <button key={ft.type} onClick={() => addField(ft.type)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-muted-foreground text-sm hover:border-primary hover:text-foreground hover:bg-accent transition-all text-left">
                  <span>{ft.icon}</span>
                  <span>{ft.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form editor */}
          <div className="flex-1 flex flex-col bg-card border border-border rounded-xl overflow-hidden min-h-0">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <Input placeholder="Название формы..." value={formName} onChange={e => setFormName(e.target.value)} className="flex-1" />
              <div className="flex gap-2">
                {activeForm && (
                  <Button variant="danger" size="sm" onClick={() => { if (confirm('Удалить форму?')) remove.mutate(activeForm.id); }}>
                    <Trash2 size={14} />
                  </Button>
                )}
                <Button size="sm" loading={create.isPending || update.isPending} disabled={!formName.trim()}
                  onClick={() => creatingNew ? create.mutate() : update.mutate()}>
                  <Save size={14} /> Сохранить
                </Button>
              </div>
            </div>

            {/* Fields */}
            <div className="flex-1 overflow-y-auto p-5">
              {fields.length === 0 && (
                <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                  <p className="text-sm">Добавьте поля из панели слева</p>
                </div>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={fields.map(f => f._key)} strategy={verticalListSortingStrategy}>
                  {fields.map(f => (
                    <SortableField key={f._key} field={f} onRemove={removeField} onUpdate={updateField} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>

            {/* Preview note */}
            {fields.length > 0 && (
              <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
                Полей: {fields.length} · Перетащите поля для изменения порядка
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sortable Field ───────────────────────────────────────────────────────────

function SortableField({ field, onRemove, onUpdate }: {
  field: LocalField;
  onRemove: (key: string) => void;
  onUpdate: (key: string, patch: Partial<LocalField>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field._key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const ft = FIELD_TYPES.find(f => f.type === field.type);

  return (
    <div ref={setNodeRef} style={style} className="bg-background border border-border rounded-xl p-4 mb-3 hover:border-primary transition-colors">
      <div className="flex items-center gap-3 mb-3">
        <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
          <GripVertical size={16} />
        </button>
        <span className="text-[11px] text-muted-foreground bg-card border border-border rounded-md px-2 py-0.5">
          {ft?.icon} {ft?.label}
        </span>
        <div className="flex-1">
          <input
            value={field.label}
            onChange={e => onUpdate(field._key, { label: e.target.value })}
            placeholder="Название поля..."
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={field.required} onChange={e => onUpdate(field._key, { required: e.target.checked })} className="accent-[#3b7efe]" />
          Обяз.
        </label>
        <button onClick={() => onRemove(field._key)} className="text-muted-foreground hover:text-red-400 transition-colors">
          <X size={15} />
        </button>
      </div>

      {/* DROPDOWN options */}
      {field.type === 'DROPDOWN' && (
        <DropdownConfig config={field.config} onChange={c => onUpdate(field._key, { config: c })} />
      )}

      {/* RESULT options */}
      {field.type === 'RESULT' && (
        <ResultConfig config={field.config} onChange={c => onUpdate(field._key, { config: c })} />
      )}
    </div>
  );
}

function DropdownConfig({ config, onChange }: { config: any; onChange: (c: any) => void }) {
  const opts: string[] = config?.options ?? [''];
  const setOpts = (o: string[]) => onChange({ ...config, options: o });
  return (
    <div className="ml-7 mt-2">
      <p className="text-xs text-muted-foreground mb-2">Варианты списка</p>
      {opts.map((o, i) => (
        <div key={i} className="flex items-center gap-2 mb-1.5">
          <input value={o} onChange={e => { const n = [...opts]; n[i] = e.target.value; setOpts(n); }}
            placeholder={`Вариант ${i + 1}`}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={() => setOpts(opts.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400"><X size={13} /></button>
        </div>
      ))}
      <button onClick={() => setOpts([...opts, ''])} className="text-xs text-primary hover:text-primary flex items-center gap-1 mt-1">
        <Plus size={12} /> Добавить вариант
      </button>
    </div>
  );
}

function ResultConfig({ config, onChange }: { config: any; onChange: (c: any) => void }) {
  const results: { label: string; type: string }[] = config?.results ?? [];
  const setResults = (r: typeof results) => onChange({ ...config, results: r });
  return (
    <div className="ml-7 mt-2">
      <p className="text-xs text-muted-foreground mb-2">Варианты результата</p>
      {results.map((r, i) => (
        <div key={i} className="flex items-center gap-2 mb-1.5">
          <input value={r.label} onChange={e => { const n = [...results]; n[i] = { ...n[i], label: e.target.value }; setResults(n); }}
            placeholder="Название результата"
            className="flex-1 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring" />
          <select value={r.type} onChange={e => { const n = [...results]; n[i] = { ...n[i], type: e.target.value }; setResults(n); }}
            className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring cursor-pointer">
            {RESULT_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
          </select>
          <button onClick={() => setResults(results.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400"><X size={13} /></button>
        </div>
      ))}
      <button onClick={() => setResults([...results, { label: '', type: 'AGREE' }])} className="text-xs text-primary hover:text-primary flex items-center gap-1 mt-1">
        <Plus size={12} /> Добавить результат
      </button>
    </div>
  );
}
