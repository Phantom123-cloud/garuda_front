'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api';
import { GarudaLogo } from '@/components/GarudaLogo';

export default function OperatorLoginPage() {
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
      await authApi.operatorLogin(login, password);
      window.location.href = '/operator';
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Неверный логин или пароль';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <GarudaLogo size={40} />
          <div>
            <div className="text-base font-semibold text-foreground">Рабочее место оператора</div>
            <div className="text-xs text-muted-foreground">Garuda ATS</div>
          </div>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground mb-1">Вход оператора</h1>
          <p className="text-sm text-muted-foreground">Введите ваши учётные данные</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Логин</label>
            <input
              type="text"
              value={login}
              onChange={e => { setLogin(e.target.value); setError(''); }}
              placeholder="operator1"
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

        <div className="mt-6 pt-4 border-t border-border text-center">
          <a href="/login" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Войти как администратор →
          </a>
        </div>
      </div>
    </div>
  );
}
