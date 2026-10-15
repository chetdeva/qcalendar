import { NextResponse, type NextRequest } from 'next/server';
import { allowedReturnOrigins } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { publicUrl } from '@/lib/public-url';
import { createClient } from '@/lib/supabase/server';

/** Landing point for Google sign-in, email confirmation and password-reset links (PKCE "code" flow). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get('next'), parseOrigins(allowedReturnOrigins));
  const code = searchParams.get('code');
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(publicUrl(next, request));
  }
  const url = publicUrl('/login', request);
  url.searchParams.set('error', 'link');
  return NextResponse.redirect(url);
}
