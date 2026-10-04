import { NextRequest, NextResponse } from 'next/server';
import { calendar } from '@/lib/calendar';
import { fail } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    return NextResponse.json(await calendar.updateEvent((await params).id, await req.json()));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    return NextResponse.json(await calendar.cancelEvent((await params).id));
  } catch (e) {
    return fail(e);
  }
}
