import { NextResponse } from 'next/server';
import { calendar } from '@/lib/calendar';
import { fail } from '@/lib/http';

export async function GET() {
  try {
    return NextResponse.json(await calendar.settings());
  } catch (e) {
    return fail(e);
  }
}
