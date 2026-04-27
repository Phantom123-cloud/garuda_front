'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Building2, Users, ShieldOff, ShieldCheck, Clock,
  MoreHorizontal, Trash2, Ban, CheckCircle, Loader2, Search,
  Activity, XCircle, AlertCircle, Calendar, Eye, LogIn, Link2,
} from 'lucide-react';
import { workspacesApi, type Workspace, type WorkspaceStatus } from '@/lib/api';

// ─── Helpers ────────────────────────────────────────────────────────────────
function statusLabel(s: WorkspaceStatus) {
  if (s === 'ACTIVE')    return { label: 'Активно',        color: 'text-emerald-500', bg: 'bg-emerald-500/10' };
  if (s === 'BLOCKED')   return { label: 'Заблокировано',  color: 'text-destructive',  bg: 'bg-destructive/10' };
  if (s === 'SUSPENDED') return { label: 'Приостановлено', color: 'text-amber-500',    bg: 'bg-amber-500/10'   };
  return { label: s, color: 'text-muted-foreground', bg: 'bg-muted' };
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isExpired(expiresAt: string | null | undefined) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function wsLoginUrl(slug: string) {
  if (typeof window !== 'undefined') return `${window.location.origin}/ws/${slug}`;
  return `/ws/${slug}`;
}

// ─── Workspace Logo ──────────────────────────────────────────────────────────
function WsLogo({ ws }: { ws: Workspace }) {
  if (ws.logoUrl) {
    return (
      <img
        src={ws.logoUrl}
        alt={ws.name}
        className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-lg bg-primary/8 flex items-center justify-center flex-shrink-0">
      <Building2 size={13} className="text-primary" />
    </div>
  );
}

// ─── Create Workspace Dialog ─────────────────────────────────────────────────
function CreateDialog({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [rootPassword, setRootPassword] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

  const handleNameChange = (v: string) => {
    setName(v);
    setSlug(autoSlug(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) { setError('Заполните название и slug'); return; }
    if (!rootPassword.trim()) { setError('Введите пароль для root-администратора'); return; }
    setLoading(true);
    setError('');
    try {
      await workspacesApi.create({
        name: name.trim(),
        slug: slug.trim(),
        rootPassword: rootPassword,
        logoUrl: logoUrl.trim() || undefined,
        expiresAt: expiresAt || undefined,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Ошибка создания');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md shadow-xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 size={16} className="text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Новое пространство</h2>
          <button
            onClick={onClose}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
          >×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Название клиента / колл-центра</label>
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="ООО Ромашка"
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Slug (идентификатор)</label>
            <input
              value={slug}
              onChange={e => setSlug(autoSlug(e.target.value))}
              placeholder="ooo-romashka"
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Только латинские буквы, цифры и дефисы. Логин root-admin = slug
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Пароль root-администратора <span className="text-destructive">*</span>
            </label>
            <input
              type="password"
              value={rootPassword}
              onChange={e => setRootPassword(e.target.value)}
              placeholder="••••••••"
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Логин будет: {slug || 'slug'}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">URL логотипа (необязательно)</label>
            <input
              value={logoUrl}
              onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Дата окончания подписки (необязательно)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              Отмена
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/88 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 size={13} className="animate-spin" />}
              Создать
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Workspace Row Actions ───────────────────────────────────────────────────
function WorkspaceActions({ ws, onRefresh }: { ws: Workspace; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const act = async (action: () => Promise<any>) => {
    setLoading(true);
    setOpen(false);
    try { await action(); onRefresh(); }
    finally { setLoading(false); }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        disabled={loading}
        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 size={13} className="animate-spin" /> : <MoreHorizontal size={14} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-popover border border-border rounded-lg shadow-lg py-1 w-48 text-sm">
            {ws.status !== 'ACTIVE' && (
              <button
                onClick={() => act(() => workspacesApi.setStatus(ws.id, 'ACTIVE'))}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-emerald-500 hover:bg-muted/50 transition-colors"
              >
                <CheckCircle size={13} /> Активировать
              </button>
            )}
            {ws.status !== 'SUSPENDED' && (
              <button
                onClick={() => act(() => workspacesApi.setStatus(ws.id, 'SUSPENDED'))}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-amber-500 hover:bg-muted/50 transition-colors"
              >
                <AlertCircle size={13} /> Приостановить
              </button>
            )}
            {ws.status !== 'BLOCKED' && (
              <button
                onClick={() => act(() => workspacesApi.setStatus(ws.id, 'BLOCKED'))}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-destructive hover:bg-muted/50 transition-colors"
              >
                <Ban size={13} /> Заблокировать
              </button>
            )}
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => {
                if (!confirm(`Удалить пространство "${ws.name}"? Все данные будут удалены.`)) return;
                act(() => workspacesApi.remove(ws.id));
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-destructive hover:bg-muted/50 transition-colors"
            >
              <Trash2 size={13} /> Удалить
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PlatformPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [enteringId, setEnteringId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ws, st] = await Promise.all([workspacesApi.getAll(), workspacesApi.getStats()]);
      setWorkspaces(ws);
      setStats(st);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEnter = async (ws: Workspace) => {
    setEnteringId(ws.id);
    try {
      await workspacesApi.impersonate(ws.id);
      window.location.href = '/admin/monitor';
    } catch {
      setEnteringId(null);
    }
  };

  const copyLink = (slug: string) => {
    const url = wsLoginUrl(slug);
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const filtered = workspaces.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const statCards = stats ? [
    { label: 'Всего',          value: stats.total,     icon: Building2,   color: 'text-foreground'  },
    { label: 'Активных',       value: stats.active,    icon: ShieldCheck, color: 'text-emerald-500' },
    { label: 'Заблокировано',  value: stats.blocked,   icon: ShieldOff,   color: 'text-destructive' },
    { label: 'Приостановлено', value: stats.suspended, icon: Clock,       color: 'text-amber-500'   },
  ] : [];

  return (
    <>
      {showCreate && (
        <CreateDialog
          onCreated={() => { setShowCreate(false); load(); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">Пространства</h1>
          <p className="text-sm text-muted-foreground">
            Управление клиентскими колл-центрами и доступом
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/88 transition-colors"
        >
          <Plus size={15} />
          Создать пространство
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={15} className={color} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              <div className={`text-2xl font-semibold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск по названию или slug..."
          className="flex h-9 w-full max-w-sm rounded-md border border-border bg-input pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 size={36} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? 'Ничего не найдено' : 'Нет пространств. Создайте первое.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Название</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Ссылка входа</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Статус</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  <div className="flex items-center gap-1.5"><Users size={11} /> Польз.</div>
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">
                  <div className="flex items-center gap-1.5"><Calendar size={11} /> Истекает</div>
                </th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Создано</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(ws => {
                const { label, color, bg } = statusLabel(ws.status);
                const expired = isExpired(ws.expiresAt);
                const isEntering = enteringId === ws.id;
                return (
                  <tr key={ws.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <WsLogo ws={ws} />
                        <div>
                          <div className="font-medium text-foreground leading-tight">{ws.name}</div>
                          <code className="text-xs text-muted-foreground/70">{ws.rootAdminLogin}</code>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => copyLink(ws.slug)}
                        title="Скопировать ссылку входа"
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
                      >
                        <Link2 size={11} className="group-hover:text-primary" />
                        <span className="font-mono truncate max-w-[160px]">/ws/{ws.slug}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${bg} ${color}`}>
                        {ws.status === 'ACTIVE'    && <Activity size={10} />}
                        {ws.status === 'BLOCKED'   && <XCircle size={10} />}
                        {ws.status === 'SUSPENDED' && <AlertCircle size={10} />}
                        {label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-muted-foreground">{ws._count?.users ?? 0}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={expired ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        {expired ? '⚠ ' : ''}{formatDate(ws.expiresAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-muted-foreground">{formatDate(ws.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        {/* Enter workspace */}
                        <button
                          onClick={() => handleEnter(ws)}
                          disabled={isEntering || ws.status !== 'ACTIVE'}
                          title="Войти в пространство"
                          className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isEntering ? <Loader2 size={11} className="animate-spin" /> : <LogIn size={11} />}
                          Войти
                        </button>
                        {/* Detail view */}
                        <button
                          onClick={() => router.push(`/platform/workspaces/${ws.id}`)}
                          title="Открыть"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        >
                          <Eye size={13} />
                        </button>
                        <WorkspaceActions ws={ws} onRefresh={load} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
