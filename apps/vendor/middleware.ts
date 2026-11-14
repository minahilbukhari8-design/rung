import { NextResponse, type NextRequest } from 'next/server';

/** Exposes the current path to server components (used by the language switch). Not used for auth. */
export function middleware(req: NextRequest) {
  const h = new Headers(req.headers);
  h.set('x-pathname', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers: h } });
}

export const config = { matcher: ['/((?!_next|bff|fonts|brand|favicon).*)'] };
