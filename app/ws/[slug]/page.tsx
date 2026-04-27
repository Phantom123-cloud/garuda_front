'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Building2, ShieldOff } from 'lucide-react';
import axios from 'axios';
import { authApi } from '@/lib/api';

interface WorkspaceInfo {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: 'ACTIVE' | 'BLOCKED' | 'SUSPENDED';
}

export default function WorkspaceLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [ws, setWs] = useState<WorkspaceInfo | null>(null);
  const [wsLoading, setWsLoading] = useState(true);
  const [wsError, setWsError] = useState('');

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load workspace info
  useEffect(() => {
    if (!slug) return;
    axios.get(`/api/workspace/${slug}/info`)
      .then(r => { setWs(r.data); setLogin(r.data.rootAdminLogin ?? ''); })
      .catch(() => setWsError('Пространство не найдено'))
      .finally(() => setWsLoading(false));
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) { setError('Введите логин и пароль'); return; }
    setLoading(true);
    setError('');
    try {
      await authApi.login(login, password);
      window.location.href = '/admin/monitor';
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Неверный логин или пароль';
      setError(msg);
      setLoading(false);
    }
  };

  // Loading state
  if (wsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Workspace not found
  if (wsError || !ws) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center">
          <Building2 size={48} className="text-muted-foreground/30 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">Пространство не найдено</h1>
          <p className="text-sm text-muted-foreground">Проверьте ссылку и попробуйте снова</p>
        </div>
      </div>
    );
  }

  // Blocked workspace
  if (ws.status !== 'ACTIVE') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center">
          <ShieldOff size={48} className="text-destructive/50 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">
            {ws.status === 'BLOCKED' ? 'Доступ заблокирован' : 'Доступ приостановлен'}
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm">
            {ws.status === 'BLOCKED'
              ? 'Доступ к пространству заблокирован. Обратитесь к администратору платформы.'
              : 'Пространство временно приостановлено. Обратитесь к администратору платформы.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left branding — workspace specific */}
      <div className="hidden lg:flex w-[420px] flex-col bg-card border-r border-border p-10 relative overflow-hidden flex-shrink-0">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="flex items-center gap-3 relative z-10">
          {ws.logoUrl ? (
            <img
              src={ws.logoUrl}
              alt={ws.name}
              className="w-9 h-9 rounded-lg object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 size={20} className="text-primary" />
            </div>
          )}
          <div>
            <div className="text-base font-semibold text-foreground">{ws.name}</div>
            <div className="text-xs text-muted-foreground">Garuda ATS</div>
          </div>
        </div>

        <div className="mt-auto relative z-10">
          <p className="text-xl font-semibold text-foreground mb-2 leading-snug">
            Единая платформа<br />управления колл-центром
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Мониторинг, аналитика, предиктивный дайлер и управление операторами в одном окне.
          </p>
          <div className="space-y-3">
            {[
              'Реальный мониторинг операторов',
              'Предиктивный и прогрессивный дайлер',
              'Конструктор форм с DnD',
              'Запись и аналитика звонков',
            ].map(f => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 relative z-10 text-xs text-muted-foreground/30">
          {ws.name} · Powered by Garuda ATS
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            {ws.logoUrl ? (
              <img src={ws.logoUrl} alt={ws.name} className="w-8 h-8 rounded-md object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Building2 size={15} className="text-primary" />
              </div>
            )}
            <span className="text-base font-semibold">{ws.name}</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Вход в систему</h1>
            <p className="text-sm text-muted-foreground">{ws.name}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Логин</label>
              <input
                type="text"
                value={login}
                onChange={e => { setLogin(e.target.value); setError(''); }}
                placeholder="admin"
                autoFocus
                className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Пароль</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="••••••••"
                  className="flex h-9 w-full rounded-md border border-border bg-input px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/88 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
