'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, Clock, User, PhoneCall, Calendar, RefreshCw, Lock } from 'lucide-react';
import { Pagination } from '@/components/ui/pagination';
import { numbersApi } from '@/lib/api';

const PAGE_SIZE = 20;

function fmtDateTime(d: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(d: Date) {
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}ч ${m}м назад`;
  return `${m}м назад`;
}

type FilterTab = 'all' | 'today' | 'overdue';

export default function CallbacksPage() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [page, setPage]     = useState(1);

  const { data: callbacks = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['callbacks'],
    queryFn: () => numbersApi.getCallbacks(),
    refetchInterval: 30_000,
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const withDate = (callbacks as any[]).map((c: any) => ({
    ...c,
    callbackAt: c.callbackAt ? new Date(c.callbackAt) : null,
  }));

  const filtered = withDate.filter((c: any) => {
    if (filter === 'today')   return c.callbackAt && c.callbackAt >= todayStart && c.callbackAt <= todayEnd;
    if (filter === 'overdue') return c.callbackAt && c.callbackAt < now;
    return true;
  });

  const overdueCount = withDate.filter((c: any) => c.callbackAt && c.callbackAt < now).length;
  const todayCount   = withDate.filter((c: any) => c.callbackAt && c.callbackAt >= todayStart && c.callbackAt <= todayEnd).length;
  const totalCount   = withDate.length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Перезвоны</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Запланированные обратные звонки клиентам</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Всего перезвонов',  val: totalCount,   color: 'text-foreground' },
          { label: 'На сегодня',        val: todayCount,   color: 'text-primary' },
          { label: 'Просрочено',        val: overdueCount, color: overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-5">
            <p className="text-xs text-muted-foreground mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-border mb-5">
        {([
          ['all',     'Все',        totalCount],
          ['today',   'Сегодня',    todayCount],
          ['overdue', 'Просрочено', overdueCount],
        ] as [FilterTab, string, number][]).map(([val, label, count]) => (
          <button key={val} onClick={() => { setFilter(val); setPage(1); }}
            className={['px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2',
              filter === val ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground',
            ].join(' ')}>
            {label}
            {count > 0 && (
              <span className={['text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                val === 'overdue' && overdueCount > 0
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-muted text-muted-foreground',
              ].join(' ')}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {isLoading && (
          <div className="bg-card border border-border rounded-xl p-16 text-center text-muted-foreground text-sm">
            Загрузка...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-16 text-center">
            <Calendar size={36} className="mx-auto mb-3 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {filter === 'overdue' ? 'Просроченных перезвонов нет' :
               filter === 'today'   ? 'На сегодня перезвонов нет' :
               'Нет запланированных перезвонов'}
            </p>
          </div>
        )}
        {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c: any, idx: number) => {
          const isOverdue = c.callbackAt && c.callbackAt < now;
          const isToday   = c.callbackAt && c.callbackAt >= todayStart && c.callbackAt <= todayEnd;
          const isLocked  = !!c.callbackOperatorId;
          return (
            <div key={`${c.phone}-${c.campaignId}-${idx}`}
              className={['bg-card border rounded-xl p-4 flex items-center gap-4 hover:border-primary/50 transition-colors',
                isOverdue ? 'border-destructive/25' : 'border-border',
              ].join(' ')}>
              {/* Icon */}
              <div className={['w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                isOverdue ? 'bg-destructive/10' : 'bg-primary/10',
              ].join(' ')}>
                <Phone size={16} className={isOverdue ? 'text-destructive' : 'text-primary'} />
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold text-foreground">{c.phone}</span>
                  {isOverdue && (
                    <span className="text-[11px] text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full font-medium">
                      Просрочено · {c.callbackAt && timeAgo(c.callbackAt)}
                    </span>
                  )}
                  {isToday && !isOverdue && (
                    <span className="text-[11px] text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                      Сегодня
                    </span>
                  )}
                  {isLocked && (
                    <span className="text-[11px] text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Lock size={9} /> Закреплён за оператором
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                  {c.operator && (
                    <span className="flex items-center gap-1">
                      <User size={11} /> {c.operator.name}
                    </span>
                  )}
                  {c.campaign && (
                    <span className="flex items-center gap-1">
                      <PhoneCall size={11} /> {c.campaign.name}
                    </span>
                  )}
                  {c.callAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} /> Звонок: {fmtDateTime(c.callAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Callback time */}
              {c.callbackAt && (
                <div className="text-right flex-shrink-0">
                  <div className={['text-sm font-semibold', isOverdue ? 'text-destructive' : 'text-foreground'].join(' ')}>
                    {fmtDateTime(c.callbackAt.toISOString())}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Запланировано</div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Pagination page={page} total={filtered.length} limit={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
