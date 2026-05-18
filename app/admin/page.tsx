'use client';
import { useAuth } from '@/lib/auth-context';
import { ALL_PERMISSIONS, PERMISSION_LABELS } from '@/lib/permissions';
import { CheckCircle2, XCircle, ShieldCheck, User } from 'lucide-react';


export default function AdminHomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const permissions = user.permissions ?? [];

  return (
    <div className="p-6 max-w-3xl">
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">
          Добро пожаловать, {user.name} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Панель управления Garuda ATS</p>
      </div>

      {/* User card */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-primary text-xl font-bold flex-shrink-0">
          {user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-foreground">{user.name}</div>
          <div className="text-sm text-muted-foreground mt-0.5">{user.login}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {user.customRole ? (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                <ShieldCheck size={12} />
                {user.customRole.name}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-accent border border-border text-muted-foreground">
                <User size={12} />
                Роль не назначена
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-2xl font-bold text-foreground">{permissions.length}</div>
          <div className="text-xs text-muted-foreground">разрешений</div>
        </div>
      </div>

      {/* Permissions grid */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Ваши разрешения</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {'Права, доступные вашей роли'}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x-0">
          {ALL_PERMISSIONS.map((perm, i) => {
            const has = permissions.includes(perm);
            const label = PERMISSION_LABELS[perm] ?? perm;
            return (
              <div
                key={perm}
                className={[
                  'flex items-center gap-3 px-5 py-3 border-b border-border',
                  !has ? 'opacity-40' : '',
                ].join(' ')}
              >
                {has
                  ? <CheckCircle2 size={15} className="text-green-400 flex-shrink-0" />
                  : <XCircle size={15} className="text-muted-foreground flex-shrink-0" />
                }
                <span className={`text-sm ${has ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
