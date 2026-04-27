'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { getCurrentWsSlug } from '@/lib/api';
import { GarudaLogo } from '@/components/GarudaLogo';
import {
  LayoutDashboard, Users, UsersRound, PhoneCall,
  FileText, Plug, Mic, BarChart3, Headphones,
  ShieldOff, BookOpen, LogOut, History, BookMarked, Shield, Settings,
  Building2,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  label: string;
  href: string; // always /admin/* or /operator/*
  icon: LucideIcon;
  permission?: string;
};
type NavGroup = { section: string; items: NavItem[] };

const nav: NavGroup[] = [
  {
    section: 'Мониторинг',
    items: [
      { label: 'Монитор', href: '/admin/monitor', icon: LayoutDashboard, permission: 'MONITOR_VIEW' },
    ],
  },
  {
    section: 'Управление',
    items: [
      { label: 'Пользователи',     href: '/admin/users',           icon: Users,      permission: 'USERS_VIEW' },
      { label: 'Роли',             href: '/admin/roles',           icon: Shield,     permission: 'ROLES_MANAGE' },
      { label: 'Команды',          href: '/admin/teams',           icon: UsersRound, permission: 'TEAMS_VIEW' },
      { label: 'Кампании',         href: '/admin/campaigns',       icon: PhoneCall,  permission: 'CAMPAIGNS_VIEW' },
      { label: 'Формы',            href: '/admin/forms',           icon: FileText,   permission: 'FORMS_MANAGE' },
      { label: 'Скрипты',          href: '/admin/scripts',         icon: BookOpen,   permission: 'SCRIPTS_MANAGE' },
      { label: 'Чёрный список',    href: '/admin/blacklist',       icon: ShieldOff,  permission: 'BLACKLIST_MANAGE' },
      { label: 'История импортов', href: '/admin/import-history',  icon: History,    permission: 'IMPORT_HISTORY_VIEW' },
    ],
  },
  {
    section: 'Аналитика',
    items: [
      { label: 'Отчёты', href: '/admin/reports', icon: BarChart3, permission: 'REPORTS_VIEW' },
    ],
  },
  {
    section: 'Система',
    items: [
      { label: 'Провайдеры',      href: '/admin/providers',   icon: Plug,       permission: 'PROVIDERS_MANAGE' },
      { label: 'Мультимедиа',     href: '/admin/media',       icon: Mic,        permission: 'MEDIA_VIEW' },
      { label: 'Коды завершения', href: '/admin/cause-codes', icon: BookMarked, permission: 'CAUSE_CODES_VIEW' },
      { label: 'Настройки',       href: '/admin/settings',    icon: Settings,   permission: 'SETTINGS_MANAGE' },
    ],
  },
  {
    section: 'Оператор',
    items: [
      { label: 'Рабочее место', href: '/operator', icon: Headphones },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname(); // browser URL, e.g. /ws/test-3d40cd9b/admin/monitor
  const { user, logout, can } = useAuth();

  // Detect workspace slug from the current URL
  // If inside /ws/:slug/admin/*, prefix all links with /ws/:slug
  const wsSlug = getCurrentWsSlug();
  const prefix = wsSlug ? `/ws/${wsSlug}` : '';

  // Resolve the canonical /admin/* path from the current browser URL
  // so active state works regardless of whether we're on /admin/* or /ws/:slug/admin/*
  const canonicalPath = wsSlug
    ? pathname.replace(`/ws/${wsSlug}`, '')  // strip the ws prefix → /admin/monitor
    : pathname;

  const link = (href: string) => `${prefix}${href}`;

  return (
    <aside className="w-[220px] bg-card border-r border-border flex flex-col flex-shrink-0 h-screen sticky top-0">
      {/* Workspace header */}
      <div className="px-4 py-4 border-b border-border flex items-center gap-2.5">
        {user?.workspace?.logoUrl ? (
          <img
            src={user.workspace.logoUrl}
            alt={user.workspace.name}
            className="w-7 h-7 rounded-lg object-cover flex-shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : user?.workspace ? (
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={14} className="text-primary" />
          </div>
        ) : (
          <GarudaLogo size={28} />
        )}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground leading-tight truncate">
            {user?.workspace?.name ?? 'Garuda ATS'}
          </div>
          <div className="text-[10px] text-muted-foreground">Garuda ATS</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {nav.map(group => {
          const visibleItems = group.items.filter(item =>
            !item.permission || can(item.permission),
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.section}>
              <p className="px-2 mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60 font-medium select-none">
                {group.section}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const Icon = item.icon;
                  const resolvedHref = link(item.href);
                  const active =
                    canonicalPath === item.href ||
                    (item.href !== '/' && canonicalPath.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={resolvedHref}
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-all duration-100',
                        'relative group',
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                      )}
                      <Icon size={15} className={active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-md">
          <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-primary text-[11px] font-semibold flex-shrink-0">
            {user?.name?.slice(0, 2).toUpperCase() ?? '??'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-foreground truncate">{user?.name ?? '—'}</div>
            <div className="text-[10px] text-muted-foreground">
              {user?.customRole?.name ?? 'Роль не назначена'}
            </div>
          </div>
          <button
            onClick={logout}
            title="Выйти"
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
