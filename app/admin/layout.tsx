'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/auth-context';
import { getCurrentWsSlug, getWsToken } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname(); // browser URL, e.g. /ws/test-3d40cd9b/admin/monitor
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const slug = getCurrentWsSlug();
    if (slug) {
      // Workspace-namespaced route — check localStorage token
      const token = getWsToken(slug);
      if (!token) router.replace(`/ws/${slug}`);
    } else {
      // Legacy /admin/* route — check cookie auth
      if (!user) router.replace('/platform/login');
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
