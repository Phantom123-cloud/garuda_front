'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Search, Upload, PhoneOff } from 'lucide-react';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';

const PAGE_SIZE = 20;

interface BlacklistEntry {
  id: number;
  phone: string;
  reason?: string;
  addedBy?: string;
  createdAt: string;
}

const blacklistApi = {
  getAll: (search?: string) => api.get('/blacklist', { params: search ? { search } : {} }).then(r => r.data),
  add: (data: { phone: string; reason?: string }) => api.post('/blacklist', data).then(r => r.data),
  addBulk: (phones: string[], reason?: string) => api.post('/blacklist', { phones, reason }).then(r => r.data),
  remove: (id: number) => api.delete(`/blacklist/${id}`),
};

export default function BlacklistPage() {
  useRequirePermission('BLACKLIST_MANAGE');
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal]   = useState<'single' | 'bulk' | null>(null);
  const [page, setPage]     = useState(1);
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [bulkText, setBulkText] = useState('');

  const { data: entries = [], isLoading } = useQuery<BlacklistEntry[]>({
    queryKey: ['blacklist', search],
    queryFn: () => blacklistApi.getAll(search || undefined),
    refetchInterval: 30_000,
  });

  const add = useMutation({
    mutationFn: () => blacklistApi.add({ phone, reason: reason || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blacklist'] }); toast('Номер добавлен', 'success'); setModal(null); setPhone(''); setReason(''); },
    onError: () => toast('Ошибка или номер уже в списке', 'error'),
  });

  const addBulk = useMutation({
    mutationFn: () => {
      const phones = bulkText.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
      return blacklistApi.addBulk(phones, reason || undefined);
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['blacklist'] });
      toast(`Добавлено: ${data.added} из ${data.total}`, 'success');
      setModal(null); setBulkText(''); setReason('');
    },
    onError: () => toast('Ошибка', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => blacklistApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blacklist'] }); toast('Удалено', 'success'); },
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Чёрный список</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Номера, исключённые из обзвона</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setModal('bulk')}><Upload size={14} /> Загрузить список</Button>
          <Button onClick={() => setModal('single')}><Plus size={14} /> Добавить номер</Button>
        </div>
      </div>

      {/* Search + stats */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по номеру..."
            className="w-full h-8 pl-9 pr-3 rounded-md border border-border bg-input text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="text-sm text-muted-foreground">
          Всего: <span className="font-semibold text-foreground">{entries.length}</span>
        </div>
      </div>

      {/* Table */}
      {(() => {
        const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        return (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Номер</th>
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Причина</th>
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Добавил</th>
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Дата</th>
                  <th className="px-4 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-sm">Загрузка...</td></tr>
                )}
                {!isLoading && entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
                      <PhoneOff size={32} className="mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Чёрный список пуст</p>
                    </td>
                  </tr>
                )}
                {paged.map(e => (
                  <tr key={e.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-3"><span className="font-mono text-sm text-foreground">{e.phone}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.reason ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.addedBy ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(e.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { if (confirm(`Удалить ${e.phone}?`)) remove.mutate(e.id); }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} total={entries.length} limit={PAGE_SIZE} onChange={setPage} />
          </div>
        );
      })()}

      {/* Add single */}
      <Modal open={modal === 'single'} onClose={() => setModal(null)} title="Добавить номер в чёрный список">
        <div className="space-y-4">
          <Input label="Номер телефона" placeholder="+79991234567" value={phone} onChange={e => setPhone(e.target.value)} />
          <Input label="Причина (необязательно)" placeholder="Отказ от обзвона" value={reason} onChange={e => setReason(e.target.value)} />
          <div className="flex gap-3 pt-2">
            <Button loading={add.isPending} disabled={!phone.trim()} onClick={() => add.mutate()}>Добавить</Button>
            <Button variant="secondary" onClick={() => setModal(null)}>Отмена</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk add */}
      <Modal open={modal === 'bulk'} onClose={() => setModal(null)} title="Загрузить список номеров" width="w-[520px]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Номера (по одному на строку, или через запятую)</label>
            <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
              placeholder={"+79991234567\n+79997654321\n+74951234567"}
              rows={8}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono" />
          </div>
          <Input label="Причина (для всех)" placeholder="Отказ от обзвона" value={reason} onChange={e => setReason(e.target.value)} />
          <div className="flex gap-3 pt-2">
            <Button loading={addBulk.isPending} disabled={!bulkText.trim()} onClick={() => addBulk.mutate()}>
              Загрузить
            </Button>
            <Button variant="secondary" onClick={() => setModal(null)}>Отмена</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
