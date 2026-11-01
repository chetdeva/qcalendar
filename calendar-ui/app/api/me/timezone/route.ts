import { NextResponse } from 'next/server';
import { callUsers, readBody } from '@/lib/bff';

/** The browser's time zone, kept by users-service only when the person has none yet. */
export async function POST(req: Request) {
  const { status, json } = await callUsers('POST', '/v1/me/timezone-hint', (await readBody(req)) ?? {});
  return NextResponse.json(json, { status });
}
