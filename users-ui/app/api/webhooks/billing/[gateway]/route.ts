import { NextResponse } from 'next/server';

const billing = () => (process.env.BILLING_API_URL ?? 'http://localhost:3012').replace(/\/$/, '');

/**
 * Payment gateways POST here. There is no login: billing-service checks the gateway's signature over the exact bytes it
 * receives, so the body is passed through untouched (text, not parsed JSON) along with the headers the signature rides in.
 */
export async function POST(req: Request, { params }: { params: Promise<{ gateway: string }> }) {
  const { gateway } = await params;
  const headers = new Headers();
  req.headers.forEach((v, k) => { if (k !== 'host' && k !== 'content-length' && k !== 'connection') headers.set(k, v); });
  try {
    const res = await fetch(`${billing()}/v1/webhooks/${encodeURIComponent(gateway)}`, { method: 'POST', headers, body: await req.text(), cache: 'no-store' });
    return new NextResponse(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
  } catch {
    return NextResponse.json({ error: { code: 'upstream', message: 'The billing service is unreachable.' } }, { status: 502 }); // the gateway will retry
  }
}
