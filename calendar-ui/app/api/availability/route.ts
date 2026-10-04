import { NextRequest, NextResponse } from 'next/server';
import { calendar } from '@/lib/calendar';
import { fail } from '@/lib/http';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(
      await calendar.availability(sp.get('from') ?? '', sp.get('to') ?? '', Number(sp.get('duration') ?? 60)),
    );
  } catch (e) {
    return fail(e);
  }
}
