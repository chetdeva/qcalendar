import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { allowedReturnOrigins } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { createClient } from '@/lib/supabase/server';

const TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/** For email templates that link here with ?token_hash=...&type=... instead of Supabase's default link. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const fallback = type === 'invite' ? '/accept-invite' : type === 'recovery' ? '/reset-password' : '/profile';
  const next = safeNext(searchParams.get('next'), parseOrigins(allowedReturnOrigins), fallback);
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  const url = new URL('/login', request.url);
  url.searchParams.set('error', 'link');
  return NextResponse.redirect(url);
}
