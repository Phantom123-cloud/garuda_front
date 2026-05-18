'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi } from './api';

interface AuthUser {
  id: number;
  name: string;
  login: string;
  status: string;
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
  /** Returns true if user has the given permission in their custom role */
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
    authApi.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await authApi.logout().catch(() => {});
    window.location.href = '/login';
  };

  const can = (permission: string): boolean => {
    if (!user) return false;
    return (user.permissions ?? []).includes(permission);
  };

  return <Ctx.Provider value={{ user, loading, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
