'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { GarudaLogo } from '@/components/GarudaLogo';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password.trim()) {
      setError('Введите логин и пароль');
      return;
    }
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

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left branding */}
      <div className="hidden lg:flex w-[420px] flex-col bg-card border-r border-border p-10 relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="flex items-center gap-3 relative z-10">
          <GarudaLogo size={36} />
          <div>
            <div className="text-base font-semibold text-foreground">Garuda ATS</div>
            <div className="text-xs text-muted-foreground">Enterprise Edition</div>
          </div>
        </div>
        <div className="mt-auto relative z-10">
          <p className="text-xl font-semibold text-foreground mb-2 leading-snug">
            Единая платформа<br />управления колл-центром
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Мониторинг, аналитика, предиктивный обзвон и управление операторами в одном окне.
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
        <div className="mt-8 relative z-10 text-xs text-muted-foreground/40">v1.0.0</div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <GarudaLogo size={32} />
            <span className="text-base font-semibold">Garuda ATS</span>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Вход в систему</h1>
            <p className="text-sm text-muted-foreground">Введите учётные данные для доступа</p>
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
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
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
