import { NextResponse } from 'next/server';
import { callCalendar, peopleOf } from '@/lib/bff';

/** People this person may start a chat with: calendar-service says who they share a class with, users-service gives the names and emails. */
export async function GET() {
  const { status, json } = await callCalendar<{ contacts: { id: string }[] }>('GET', '/v1/contacts');
  if (status !== 200) return NextResponse.json(json, { status });
  const people = await peopleOf(json.contacts.map((c) => c.id));
  return NextResponse.json({ contacts: json.contacts.map((c) => people.get(c.id) ?? { id: c.id, name: 'Unknown person', email: '' }) });
}
