'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/**
 * Redirects to /admin if the user lacks the given permission.
 * Call at the top of any protected page component.
 */
export function useRequirePermission(permission: string) {
  const { can, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !can(permission)) {
      router.replace('/admin');
    }
  }, [loading, permission]);
}
