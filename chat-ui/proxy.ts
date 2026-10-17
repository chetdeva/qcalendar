import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { cookieOptions } from '@/lib/cookies';
import { supabaseKey, supabaseUrl, usersUiUrl } from '@/lib/env';

/**
 * Keeps the shared login cookie fresh and sends signed-out visitors to the users-ui login page, which sends them
 * straight back here afterwards. API routes are left alone: they answer 401 themselves.
 */
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
  const { pathname, search, origin } = request.nextUrl;

  if (!user && !pathname.startsWith('/api/')) {
    const login = new URL(`${usersUiUrl}/login`);
    login.searchParams.set('next', `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? origin}${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
