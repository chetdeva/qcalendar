import { NextResponse } from 'next/server';
import { callBilling, callCalendar } from '@/lib/bff';

/** What the student's nudge cards show: billing's prompts, plus the free class they already asked for, if any. Never fails the page. */
export async function GET() {
  const [bill, req] = await Promise.all([callBilling<{ prompts?: string[] }>('GET', '/v1/billing/me'), callCalendar<{ request?: { start: string | null; end: string | null } | null }>('GET', '/v1/trial-requests/mine')]);
  if (bill.status !== 200) return NextResponse.json({ prompts: [], request: null });
  return NextResponse.json({ prompts: bill.json.prompts ?? [], request: req.status === 200 ? (req.json.request ?? null) : null });
}
