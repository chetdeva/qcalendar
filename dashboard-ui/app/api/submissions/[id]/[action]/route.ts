import { NextResponse } from 'next/server';
import { forwardDashboard, readBody } from '@/lib/bff';

/** Save a draft or publish a grade: action is "draft" or "publish". Anything else is not a route. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== 'draft' && action !== 'publish') return NextResponse.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });
  return forwardDashboard('POST', `/v1/submissions/${encodeURIComponent(id)}/${action}`, (await readBody(req)) ?? null);
}
