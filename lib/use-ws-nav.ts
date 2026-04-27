import { useRouter } from 'next/navigation';
import { getCurrentWsSlug } from './api';

/**
 * Returns a navigation helper that automatically prefixes /admin/* and /operator/* paths
 * with the current workspace slug when inside a /ws/:slug/ context.
 *
 * Usage:
 *   const { push, href } = useWsNav();
 *   push('/admin/campaigns');        // → /ws/test-3d40cd9b/admin/campaigns
 *   href('/admin/campaigns/5');      // → /ws/test-3d40cd9b/admin/campaigns/5
 */
export function useWsNav() {
  const router = useRouter();

  const resolve = (path: string): string => {
    const slug = getCurrentWsSlug();
    if (!slug) return path;
    // Prefix /admin/* and /operator/* paths
    if (path.startsWith('/admin') || path.startsWith('/operator')) {
      return `/ws/${slug}${path}`;
    }
    return path;
  };

  return {
    /** Resolve a path with workspace prefix */
    href: resolve,
    /** Navigate to a path with workspace prefix */
    push: (path: string) => router.push(resolve(path)),
    /** Replace current route with workspace-prefixed path */
    replace: (path: string) => router.replace(resolve(path)),
  };
}
