import { NextRequest, NextResponse } from 'next/server';

// Paths that never require auth on the server side
const PUBLIC_PREFIXES = [
  '/platform/login',
  '/platform/auth',
  '/operator-login',
  '/ws/',          // workspace login AND workspace admin routes (auth handled client-side)
  '/login',        // redirects to /platform/login via page component
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const accessToken   = req.cookies.get('access_token')?.value;
  const operatorToken = req.cookies.get('operator_token')?.value;
  const platformToken = req.cookies.get('platform_token')?.value;

  // ── Operator pages ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/operator')) {
    if (!operatorToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/operator-login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Platform admin pages ───────────────────────────────────────────────────
  if (pathname.startsWith('/platform')) {
    if (!platformToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/platform/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Legacy /admin/* routes (cookie-based, single workspace) ───────────────
  if (pathname.startsWith('/admin')) {
    if (!accessToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/platform/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Root path ──────────────────────────────────────────────────────────────
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    if (platformToken)      url.pathname = '/platform';
    else if (accessToken)   url.pathname = '/admin/monitor';
    else if (operatorToken) url.pathname = '/operator/softphone';
    else                    url.pathname = '/platform/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api|.*\\..*).*)'],
};
