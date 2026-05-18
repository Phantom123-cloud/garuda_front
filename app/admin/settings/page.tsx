'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, GripVertical, Check, X, Eye, EyeOff } from 'lucide-react';
import { pauseReasonsApi, type PauseReason } from '@/lib/api';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SettingsPage() {
  useRequirePermission('SETTINGS_MANAGE');
  const { can } = useAuth();
  const canManage = can('SETTINGS_MANAGE');
  const { toast } = useToast();
  const qc = useQueryClient();

  const [newLabel, setNewLabel] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const { data: reasons = [], isLoading } = useQuery<PauseReason[]>({
    queryKey: ['pause-reasons'],
    queryFn: pauseReasonsApi.getAll,
  });

  const create = useMutation({
    mutationFn: () => pauseReasonsApi.create({ label: newLabel.trim(), order: reasons.length }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pause-reasons'] });
      toast('Причина добавлена', 'success');
      setNewLabel('');
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Ошибка', 'error'),
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => pauseReasonsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pause-reasons'] });
      setEditId(null);
    },
    onError: (e: any) => toast(e?.response?.data?.message ?? 'Ошибка', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => pauseReasonsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pause-reasons'] });
      toast('Причина удалена', 'success');
    },
    onError: () => toast('Ошибка удаления', 'error'),
  });

  const startEdit = (r: PauseReason) => {
    setEditId(r.id);
    setEditLabel(r.label);
  };

  const saveEdit = () => {
    if (!editLabel.trim() || editId == null) return;
    update.mutate({ id: editId, data: { label: editLabel.trim() } });
  };

  const toggleActive = (r: PauseReason) => {
    update.mutate({ id: r.id, data: { active: !r.active } });
  };

  return (
    <div className="p-6 max-w-xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Настройки</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Системные параметры</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Причины паузы</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Статусы, доступные оператору во время перерыва
          </p>
        </div>

        {/* List */}
        <div className="divide-y divide-border">
          {isLoading && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">Загрузка...</div>
          )}
          {!isLoading && reasons.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Причины не настроены
            </div>
          )}
          {reasons.map(r => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3">
              <GripVertical size={14} className="text-muted-foreground flex-shrink-0 cursor-grab" />

              {editId === r.id ? (
                /* Edit mode */
                <div className="flex-1 flex items-center gap-2">
                  <input
                    value={editLabel}
                    onChange={e => setEditLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditId(null); }}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                  <button onClick={saveEdit} disabled={update.isPending}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors">
                    <Check size={13} />
                  </button>
                  <button onClick={() => setEditId(null)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-accent text-muted-foreground border border-border hover:text-foreground transition-colors">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                /* View mode */
                <>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${r.active ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                      {r.label}
                    </span>
                    {!r.active && (
                      <span className="ml-2 text-[10px] text-muted-foreground">(скрыта)</span>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(r)}
                        title={r.active ? 'Скрыть' : 'Показать'}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors"
                      >
                        {r.active ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                      <button
                        onClick={() => startEdit(r)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent hover:border-border transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Удалить «${r.label}»?`)) remove.mutate(r.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        {canManage && (
          <div className="px-5 py-4 border-t border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <input
                placeholder="Новая причина паузы..."
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newLabel.trim()) create.mutate(); }}
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
              />
              <button
                onClick={() => create.mutate()}
                disabled={!newLabel.trim() || create.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-[#6b84ff] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} /> Добавить
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Параметры предиктива настраиваются отдельно в каждой кампании.
      </p>
    </div>
  );
}
