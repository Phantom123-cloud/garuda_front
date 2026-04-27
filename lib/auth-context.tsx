'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, getCurrentWsSlug, getWsToken, removeWsToken } from './api';

interface AuthWorkspace {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: string;
}

interface AuthUser {
  id: number;
  name: string;
  login: string;
  status: string;
  workspaceId?: number;
  workspace?: AuthWorkspace;
  permissions?: string[];
  customRoleId?: number | null;
  customRole?: { id: number; name: string; permissions: string[] } | null;
  // Operator-specific fields
  type?: 'operator';
  extension?: string | null;
  sipPassword?: string;
  teamId?: number | null;
  activeCampaignId?: number | null;
  activeCampaign?: {
    id: number; name: string; dialMode: string;
    timeFrom: string; timeTo: string; forcedConnection: boolean;
    acwTimeout?: number | null;
    resultLimits?: Record<string, number> | null;
    form?: { id: number; name: string } | null;
    script?: { id: number; name: string } | null;
  } | null;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  loading: true,
  logout: async () => {},
  can: () => false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The api instance automatically sends the ws Bearer token via request interceptor
    // (when on /ws/:slug/admin/* paths). Works for both cookie and localStorage auth.
    authApi.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    const slug = getCurrentWsSlug();
    if (slug) {
      removeWsToken(slug);
      await authApi.logout().catch(() => {});
      window.location.href = `/ws/${slug}`;
    } else {
      await authApi.logout().catch(() => {});
      window.location.href = '/platform/login';
    }
  };

  const can = (permission: string): boolean => {
    if (!user) return false;
    return (user.permissions ?? []).includes(permission);
  };

  return <Ctx.Provider value={{ user, loading, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
