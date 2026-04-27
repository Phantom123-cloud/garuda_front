'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/auth-context';
import { getCurrentWsSlug, getWsToken } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname(); // browser URL
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const slug = getCurrentWsSlug(); // from /ws/:slug/admin/* URLs

    if (slug) {
      // Inside /ws/:slug/admin/* — check localStorage token
      const token = getWsToken(slug);
      if (!token) router.replace(`/ws/${slug}`);
    } else {
      // Direct /admin/* access — redirect to workspace-namespaced URL
      if (!user) {
        router.replace('/platform/login');
        return;
      }
      const wsSlug = (user as any).workspace?.slug;
      if (wsSlug) {
        // Preserve current path: /admin/campaigns → /ws/:slug/admin/campaigns
        const wsPath = `/ws/${wsSlug}${pathname}`;
        router.replace(wsPath);
      }
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // While redirecting from /admin/* to /ws/:slug/admin/* — show spinner
  const slug = getCurrentWsSlug();
  if (!slug && user) {
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
