import { NextResponse, type NextRequest } from 'next/server';
import { publicUrl } from '@/lib/public-url';
import { createClient } from '@/lib/supabase/server';

/** POST only, so a link or image on another site cannot sign people out. Signs out of every app sharing the cookie. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(publicUrl('/login', request), 303);
}
