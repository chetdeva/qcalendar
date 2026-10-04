// Server-side only. Copy into your Next.js app (e.g. lib/calendar.ts).
// Env: CALENDAR_API_URL=https://calendar.example.com  CALENDAR_API_KEY=...
export type EventCategory = 'tutoring' | 'office_hours' | 'personal';

export interface CalendarEvent {
  id: string; title: string; description: string | null; location: string | null;
  start: string; end: string; timezone: string; attendees: string[];
  externalRef: string | null; meet: boolean; meetUrl: string | null; category: EventCategory;
  status: 'confirmed' | 'cancelled'; syncStatus: 'pending' | 'synced' | 'error';
}
export interface CreateEventInput {
  title: string; start: string; end?: string; durationMinutes?: number; timezone?: string;
  attendees?: string[]; description?: string; location?: string; meet?: boolean;
  externalRef?: string; category?: EventCategory; force?: boolean;
}

export class CalendarError extends Error {
  status: number; code: string; details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${process.env.CALENDAR_API_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.CALENDAR_API_KEY}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new CalendarError(res.status, json.error?.code ?? 'error', json.error?.message ?? res.statusText, json.error?.details);
  return json as T;
}

export interface CalendarSettings {
  timezone: string;
  workingHours: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', [string, string][]>;
  bufferMinutes: number;
  slotStepMinutes: number;
  webhookUrl: string;
}

export const calendar = {
  settings: () => request<CalendarSettings>('GET', '/v1/settings'),
  googleStatus: () => request<{ configured: boolean; connected: boolean; unsyncedEvents: number }>('GET', '/v1/google/status'),
  createEvent: (input: CreateEventInput) => request<CalendarEvent>('POST', '/v1/events', input),
  getEvent: (id: string) => request<CalendarEvent>('GET', `/v1/events/${id}`),
  listEvents: (q: { from?: string; to?: string; externalRef?: string; attendee?: string } = {}) =>
    request<{ events: CalendarEvent[] }>('GET', `/v1/events?${new URLSearchParams(q as Record<string, string>)}`),
  updateEvent: (id: string, patch: Partial<CreateEventInput>) => request<CalendarEvent>('PATCH', `/v1/events/${id}`, patch),
  cancelEvent: (id: string) => request<CalendarEvent>('DELETE', `/v1/events/${id}`),
  availability: (from: string, to: string, duration = 60) =>
    request<{ timezone: string; slots: { start: string; end: string }[]; warnings: string[] }>(
      'GET', `/v1/availability?${new URLSearchParams({ from, to, duration: String(duration) })}`),
};
