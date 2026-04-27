'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Users, Plus, Building2, Loader2, Shield, ShieldOff,
  CheckCircle, Ban, AlertCircle, Trash2, Calendar, Activity, XCircle,
} from 'lucide-react';
import { workspacesApi, platformApi, type Workspace, type WorkspaceStatus } from '@/lib/api';

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

// ─── Add User Dialog ─────────────────────────────────────────────────────────
function AddUserDialog({
  workspaceId, onAdded, onClose,
}: {
  workspaceId: number;
  onAdded: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !login.trim() || !password.trim()) {
      setError('Заполните все поля');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await platformApi.post(`/platform/workspaces/${workspaceId}/users`, {
        name: name.trim(), login: login.trim(), password,
      });
      onAdded();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Ошибка создания');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users size={16} className="text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Добавить пользователя</h2>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Имя</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Иван Петров"
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Логин</label>
            <input value={login} onChange={e => setLogin(e.target.value)} placeholder="ivan.petrov"
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{error}</div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              Отмена
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/88 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Loader2 size={13} className="animate-spin" />}
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function WorkspaceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const workspaceId = Number(id);

  const [ws, setWs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await workspacesApi.getOne(workspaceId);
      setWs(data);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (status: WorkspaceStatus) => {
    setActionLoading(true);
    try { await workspacesApi.setStatus(workspaceId, status); await load(); }
    finally { setActionLoading(false); }
  };

  const toggleUser = async (userId: number) => {
    await platformApi.patch(`/platform/workspaces/${workspaceId}/users/${userId}/toggle-status`);
    await load();
  };

  const removeUser = async (userId: number) => {
    if (!confirm('Удалить пользователя?')) return;
    await platformApi.delete(`/platform/workspaces/${workspaceId}/users/${userId}`);
    await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ws) return null;

  const { label, color, bg } = statusLabel(ws.status);

  return (
    <>
      {showAddUser && (
        <AddUserDialog
          workspaceId={workspaceId}
          onAdded={() => { setShowAddUser(false); load(); }}
          onClose={() => setShowAddUser(false)}
        />
      )}

      {/* Back + Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/platform')}
          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
          <ArrowLeft size={15} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 size={17} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{ws.name}</h1>
            <code className="text-xs text-muted-foreground">{ws.slug}</code>
          </div>
          <span className={`ml-2 inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${bg} ${color}`}>
            {ws.status === 'ACTIVE'    && <Activity size={10} />}
            {ws.status === 'BLOCKED'   && <XCircle size={10} />}
            {ws.status === 'SUSPENDED' && <AlertCircle size={10} />}
            {label}
          </span>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Calendar size={13} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Создано</span>
          </div>
          <div className="text-sm font-medium text-foreground">{formatDate(ws.createdAt)}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Calendar size={13} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Истекает</span>
          </div>
          <div className={`text-sm font-medium ${ws.expiresAt && new Date(ws.expiresAt) < new Date() ? 'text-destructive' : 'text-foreground'}`}>
            {formatDate(ws.expiresAt)}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Users size={13} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Пользователи</span>
          </div>
          <div className="text-sm font-medium text-foreground">{ws._count?.users ?? 0}</div>
        </div>
      </div>

      {/* Status actions */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Управление доступом</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setStatus('ACTIVE')}
            disabled={actionLoading || ws.status === 'ACTIVE'}
            className="flex items-center gap-2 h-8 px-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-xs font-medium hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <CheckCircle size={12} /> Активировать
          </button>
          <button
            onClick={() => setStatus('SUSPENDED')}
            disabled={actionLoading || ws.status === 'SUSPENDED'}
            className="flex items-center gap-2 h-8 px-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-500 text-xs font-medium hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <AlertCircle size={12} /> Приостановить
          </button>
          <button
            onClick={() => {
              if (!confirm(`Заблокировать пространство "${ws.name}"? Пользователи потеряют доступ.`)) return;
              setStatus('BLOCKED');
            }}
            disabled={actionLoading || ws.status === 'BLOCKED'}
            className="flex items-center gap-2 h-8 px-3 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Ban size={12} /> Заблокировать
          </button>
        </div>
        {ws.status !== 'ACTIVE' && (
          <p className="mt-3 text-xs text-muted-foreground">
            {ws.status === 'BLOCKED'
              ? '⛔ Пространство заблокировано. Пользователи не могут войти в систему.'
              : '⚠ Пространство приостановлено. Пользователи не могут войти в систему.'}
          </p>
        )}
      </div>

      {/* Users */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Пользователи</h2>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{ws.users?.length ?? 0}</span>
          </div>
          <button
            onClick={() => setShowAddUser(true)}
            className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/88 transition-colors"
          >
            <Plus size={12} /> Добавить
          </button>
        </div>

        {ws.users?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users size={32} className="text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Нет пользователей</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Добавьте первого администратора для этого пространства</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Имя</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Логин</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Статус</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Создан</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {ws.users?.map((u: any) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {u.name[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <code className="text-xs text-muted-foreground">{u.login}</code>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${u.status === 'ACTIVE' ? 'text-emerald-500 bg-emerald-500/10' : 'text-destructive bg-destructive/10'}`}>
                      {u.status === 'ACTIVE' ? 'Активен' : 'Заблокирован'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => toggleUser(u.id)}
                        title={u.status === 'ACTIVE' ? 'Заблокировать' : 'Разблокировать'}
                        className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                        {u.status === 'ACTIVE' ? <ShieldOff size={13} /> : <Shield size={13} />}
                      </button>
                      <button onClick={() => removeUser(u.id)}
                        className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
