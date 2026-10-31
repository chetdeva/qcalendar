import { NextResponse } from 'next/server';

const calendar = () => (process.env.CALENDAR_API_URL ?? '').replace(/\/$/, '');
const fail = (status: number, message: string) => NextResponse.json({ error: { message } }, { status });

/**
 * The free-class form posts here; this server passes it to calendar-service with the website's own narrow key (LEADS_API_KEY, which can do
 * nothing but add a request). The key and the service address stay on the server. Unset = 503 and the form offers WhatsApp instead.
 */
export async function POST(req: Request) {
  const url = calendar();
  const key = process.env.LEADS_API_KEY ?? '';
  if (!url || !key) return fail(503, 'Requests are not available right now.');
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail(400, 'Please check the form and try again.');
  try {
    const res = await fetch(`${url}/v1/leads`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
    if (res.status === 201) return NextResponse.json({ ok: true }, { status: 201 });
    return fail(res.status === 400 ? 400 : 502, res.status === 400 ? 'Please check the form and try again.' : 'Requests are not available right now.');
  } catch {
    return fail(502, 'Requests are not available right now.');
  }
}
