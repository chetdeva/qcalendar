import { NextResponse } from 'next/server';
import { callDashboard } from '@/lib/bff';

/** The mentors a student can ask for a class: the published mentor profiles, as the dashboard lists them. */
export async function GET() {
  const { status, json } = await callDashboard('GET', '/v1/mentors');
  return NextResponse.json(json, { status });
}
