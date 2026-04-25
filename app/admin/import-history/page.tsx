'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History, Upload, Trash2, CheckCircle2, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { importLogsApi } from '@/lib/api';
import { useRequirePermission } from '@/hooks/useRequirePermission';

const PAGE_SIZE = 20;

function fmtDate(d: string) {
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDuration(ms?: number | null) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

export default function ImportHistoryPage() {
  useRequirePermission('IMPORT_HISTORY_VIEW');
  const [page, setPage] = useState(0);
  const [campaignFilter, setCampaignFilter] = useState('');

  const { data: logs = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['import-logs'],
    queryFn: () => importLogsApi.getAll(),
    refetchInterval: 30_000,
  });

  // Client-side filter by campaign name/id
  const filtered = logs.filter(l => {
    if (!campaignFilter) return true;
    const q = campaignFilter.toLowerCase();
    return (
      String(l.campaignId).includes(q) ||
      (l.campaign?.name ?? '').toLowerCase().includes(q)
    );
  });

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalImported = logs.filter(l => l.type === 'import').reduce((s: number, l: any) => s + (l.processed ?? 0), 0);
  const totalDeleted  = logs.filter(l => l.type === 'delete').reduce((s: number, l: any) => s + (l.processed ?? 0), 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <History size={20} className="text-primary" /> История импортов
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Журнал операций с базой номеров</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
        >
          <RefreshCw size={13} /> Обновить
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Всего операций', val: logs.length, color: 'text-foreground' },
          { label: 'Импортировано номеров', val: totalImported.toLocaleString('ru'), color: 'text-green-400' },
          { label: 'Удалено номеров', val: totalDeleted.toLocaleString('ru'), color: 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="mb-4">
        <input
          value={campaignFilter}
          onChange={e => { setCampaignFilter(e.target.value); setPage(0); }}
          placeholder="Поиск по кампании..."
          className="w-64 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['ID', 'Кампания', 'Тип', 'Файл', 'Всего в файле', 'Дублей', 'Чёрный список', 'Обработано', 'Инициатор', 'Статус', 'Длительность', 'Дата'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground text-sm">
                  <Loader2 size={16} className="inline animate-spin mr-2" />Загрузка...
                </td>
              </tr>
            )}
            {!isLoading && paginated.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-16 text-center">
                  <History size={36} className="mx-auto mb-3 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">История пуста</p>
                </td>
              </tr>
            )}
            {paginated.map((log: any) => (
              <tr key={log.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-3 py-3 text-muted-foreground font-mono text-xs">#{log.id}</td>
                <td className="px-3 py-3">
                  <div className="text-sm font-medium text-foreground">{log.campaign?.name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">ID: {log.campaignId}</div>
                </td>
                <td className="px-3 py-3">
                  {log.type === 'import' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                      <Upload size={10} /> Импорт
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                      <Trash2 size={10} /> Удаление
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground max-w-[160px] truncate" title={log.filename ?? ''}>
                  {log.filename ?? '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm text-foreground">
                  {log.totalInFile > 0 ? log.totalInFile.toLocaleString('ru') : '—'}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm">
                  {log.duplicates > 0 ? (
                    <span className="text-yellow-400">{log.duplicates.toLocaleString('ru')}</span>
                  ) : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm">
                  {(log.blacklisted ?? 0) > 0 ? (
                    <span className="text-purple-400">{log.blacklisted.toLocaleString('ru')}</span>
                  ) : <span className="text-muted-foreground">0</span>}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm text-foreground font-semibold">
                  {log.processed.toLocaleString('ru')}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{log.initiator ?? '—'}</td>
                <td className="px-3 py-3">
                  {log.status === 'completed' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-green-400">
                      <CheckCircle2 size={11} /> Завершено
                    </span>
                  ) : log.status === 'error' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                      <AlertCircle size={11} /> Ошибка
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-yellow-400">
                      <Loader2 size={11} className="animate-spin" /> В процессе
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground font-mono">{fmtDuration(log.durationMs)}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 0 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/10">
            <span className="text-xs text-muted-foreground">
              {filtered.length === 0 ? '0 записей' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, filtered.length)} из ${filtered.length}`}
            </span>
            <div className="flex gap-1">
              {Array.from({ length: Math.min(pages, 10) }).map((_, i) => (
                <button key={i} onClick={() => setPage(i)}
                  className={['w-7 h-7 rounded text-xs font-medium transition-colors',
                    page === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  ].join(' ')}>
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
