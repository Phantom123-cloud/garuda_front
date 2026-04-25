import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/operator-login'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get('access_token')?.value
    ?? req.cookies.get('operator_token')?.value;

  if (!token) {
    const url = req.nextUrl.clone();
    // Operator paths redirect to operator login
    url.pathname = pathname.startsWith('/operator') ? '/operator-login' : '/login';
    return NextResponse.redirect(url);
  }

  // Operator pages: must have operator_token (not admin access_token)
  if (pathname.startsWith('/operator') && !pathname.startsWith('/operator-login')) {
    const opToken = req.cookies.get('operator_token')?.value;
    if (!opToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/operator-login';
      return NextResponse.redirect(url);
    }
  }

  // Admin pages: must have access_token (not operator_token)
  if (pathname.startsWith('/admin')) {
    const adminToken = req.cookies.get('access_token')?.value;
    if (!adminToken) {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|api|.*\\..*).*)'],
};
