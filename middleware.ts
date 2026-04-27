import { NextRequest, NextResponse } from 'next/server';

// Paths that never require auth
const PUBLIC_PATHS = [
  '/platform/login',
  '/platform/auth',
  '/operator-login',
  '/ws/',        // workspace branded login pages
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Redirect old /login to /platform/login
  if (pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/platform/login';
    return NextResponse.redirect(url);
  }

  const accessToken  = req.cookies.get('access_token')?.value;
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

  // ── Workspace admin pages (/admin/*) ───────────────────────────────────────
  if (pathname.startsWith('/admin')) {
    if (!accessToken) {
      // No workspace token — send to platform login
      // (workspace users should use their /ws/{slug} link)
      const url = req.nextUrl.clone();
      url.pathname = '/platform/login';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // ── Root path ──────────────────────────────────────────────────────────────
  if (pathname === '/') {
    const url = req.nextUrl.clone();
    if (platformToken) url.pathname = '/platform';
    else if (accessToken) url.pathname = '/admin/monitor';
    else if (operatorToken) url.pathname = '/operator/softphone';
    else url.pathname = '/platform/login';
    return NextResponse.redirect(url);
  }

  // Any other path — if no token at all, redirect to platform login
  if (!accessToken && !operatorToken && !platformToken) {
    const url = req.nextUrl.clone();
    url.pathname = '/platform/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api|.*\\..*).*)'],
};
