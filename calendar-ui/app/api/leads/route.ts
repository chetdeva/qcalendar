import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

/** Admins only (calendar-service checks): the free-class requests saved from the website form. */
export async function GET() {
  const { status, json } = await callCalendar('GET', '/v1/admin/leads?limit=20');
  return NextResponse.json(json, { status });
}
