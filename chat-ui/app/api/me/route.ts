import { NextResponse } from 'next/server';
import { callUsers } from '@/lib/bff';

export async function GET() {
  const { status, json } = await callUsers('GET', '/v1/me');
  return NextResponse.json(json, { status });
}
