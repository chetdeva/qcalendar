import { NextResponse } from 'next/server';
import { callBilling, callCalendar } from '@/lib/bff';

/** What the student's nudge cards show: billing's prompts, plus whether they already asked for the free class. Never fails the page. */
export async function GET() {
  const [bill, req] = await Promise.all([callBilling<{ prompts?: string[] }>('GET', '/v1/billing/me'), callCalendar<{ request?: unknown }>('GET', '/v1/trial-requests/mine')]);
  if (bill.status !== 200) return NextResponse.json({ prompts: [], requested: false });
  return NextResponse.json({ prompts: bill.json.prompts ?? [], requested: req.status === 200 && Boolean(req.json.request) });
}
