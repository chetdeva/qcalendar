import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieOptions } from '@/lib/cookies';
import { allowedReturnOrigins, supabaseKey, supabaseUrl } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';

const PROTECTED = ['/profile', '/admin'];
const GUEST_ONLY = ['/login', '/signup'];
const startsWith = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/** Refreshes the session cookie on every request and sends signed-out visitors to /login. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: cookieOptions(),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname, search } = request.nextUrl;

  const redirect = (to: string | URL) => {
    const r = NextResponse.redirect(typeof to === 'string' ? new URL(to, request.url) : to);
    response.cookies.getAll().forEach((c) => r.cookies.set(c)); // keep any refreshed session
    return r;
  };

  if (!user && startsWith(pathname, PROTECTED)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname + search);
    return redirect(url);
  }
  if (user && startsWith(pathname, GUEST_ONLY)) {
    const next = safeNext(request.nextUrl.searchParams.get('next'), parseOrigins(allowedReturnOrigins));
    return redirect(next);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
