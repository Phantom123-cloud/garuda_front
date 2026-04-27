'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Shield, LogOut, Loader2 } from 'lucide-react';
import { platformAuthApi } from '@/lib/api';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<{ login: string } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (pathname === '/platform/login') { setChecked(true); return; }
    platformAuthApi.me()
      .then(data => { setAdmin(data); setChecked(true); })
      .catch(() => { router.replace('/platform/login'); });
  }, [pathname, router]);

  const handleLogout = async () => {
    await platformAuthApi.logout();
    window.location.href = '/platform/login';
  };

  if (pathname === '/platform/login') return <>{children}</>;
  if (!checked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card flex items-center px-6 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Shield size={15} className="text-primary" />
          </div>
          <span className="text-sm font-semibold text-foreground">Garuda Platform</span>
          <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 ml-1">Admin Controller</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{admin?.login}</span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={13} />
            Выйти
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
