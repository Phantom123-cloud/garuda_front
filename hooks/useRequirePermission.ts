'use client';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useWsNav } from '@/lib/use-ws-nav';

/**
 * Redirects to monitor page if the user lacks the given permission.
 * Respects workspace-namespaced routes (/ws/:slug/admin/*).
 */
export function useRequirePermission(permission: string) {
  const { can, loading } = useAuth();
  const { replace } = useWsNav();

  useEffect(() => {
    if (!loading && !can(permission)) {
      replace('/admin/monitor');
    }
  }, [loading, permission]);
}
