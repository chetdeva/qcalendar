// Server-side only. Copy into a backend that talks to calendar-service with the service API key
// (for example the future booking app), or pass a person's own access token to act as that person.
// Env: CALENDAR_API_URL=https://calendar.example.com  CALENDAR_API_KEY=...
export type EventCategory = 'tutoring' | 'office_hours' | 'personal';
export type ParticipantStatus = 'invited' | 'accepted' | 'declined';

export interface Participant { id: string; userId: string | null; email: string; name: string | null; status: ParticipantStatus; respondedAt: string | null }

export interface CalendarEvent {
  id: string; ownerId: string; ownerName: string | null; ownerEmail: string | null;
  title: string; description: string | null; location: string | null; meetingUrl: string | null;
  start: string; end: string; timezone: string; category: EventCategory; status: 'confirmed' | 'cancelled';
  externalRef: string | null;
  /** Everyone for the owner and staff; only yourself for a student. */
  participants: Participant[];
  participantCount: number;
  /** Set when you are viewing as a participant. */
  myStatus?: ParticipantStatus | null;
  createdAt: string; updatedAt: string;
}

export interface ParticipantInput { email: string; name?: string; userId?: string }

export interface CreateEventInput {
  title: string; start: string; end?: string; durationMinutes?: number; timezone?: string;
  description?: string; location?: string; category?: EventCategory; externalRef?: string;
  /** An https link, or set meet: true to get a unique Jitsi room. */
  meetingUrl?: string; meet?: boolean;
  participants?: ParticipantInput[];
  /** Required with the service key; teachers always use their own calendar. */
  ownerId?: string; ownerEmail?: string; ownerName?: string;
  /** Book over a clash on purpose. */
  force?: boolean;
}

export interface CalendarSettings {
  teacherId: string; timezone: string;
  workingHours: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', [string, string][]>;
  bufferMinutes: number; slotStepMinutes: number;
}

export class CalendarError extends Error {
  status: number; code: string; details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}

/** token: the service API key, or a signed-in person's Supabase access token. */
export function calendarClient(token: string, baseUrl = process.env.CALENDAR_API_URL ?? '') {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new CalendarError(res.status, json.error?.code ?? 'error', json.error?.message ?? res.statusText, json.error?.details);
    return json as T;
  }
  const qs = (q: Record<string, string | undefined>) => new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => e[1] !== undefined)).toString();
  return {
    createEvent: (input: CreateEventInput) => request<CalendarEvent>('POST', '/v1/events', input),
    getEvent: (id: string) => request<CalendarEvent>('GET', `/v1/events/${id}`),
    listEvents: (q: { from?: string; to?: string; ownerId?: string; participant?: string; externalRef?: string; includeCancelled?: 'true' } = {}) =>
      request<{ events: CalendarEvent[] }>('GET', `/v1/events?${qs(q)}`),
    updateEvent: (id: string, patch: Partial<CreateEventInput>) => request<CalendarEvent>('PATCH', `/v1/events/${id}`, patch),
    cancelEvent: (id: string) => request<CalendarEvent>('DELETE', `/v1/events/${id}`),
    addParticipants: (id: string, participants: ParticipantInput[], force = false) => request<CalendarEvent>('POST', `/v1/events/${id}/participants`, { participants, force }),
    removeParticipant: (id: string, participantId: string) => request<CalendarEvent>('DELETE', `/v1/events/${id}/participants/${participantId}`),
    respond: (id: string, response: 'accepted' | 'declined') => request<CalendarEvent>('POST', `/v1/events/${id}/respond`, { response }),
    availability: (q: { from: string; to: string; duration?: number; teacherId?: string }) =>
      request<{ teacherId: string; timezone: string; slots: { start: string; end: string }[] }>('GET', `/v1/availability?${qs({ from: q.from, to: q.to, duration: q.duration ? String(q.duration) : undefined, teacherId: q.teacherId })}`),
    settings: (teacherId?: string) => request<CalendarSettings>('GET', `/v1/settings?${qs({ teacherId })}`),
    updateSettings: (patch: Partial<Omit<CalendarSettings, 'teacherId'>>, teacherId?: string) => request<CalendarSettings>('PUT', `/v1/settings?${qs({ teacherId })}`, patch),
  };
}
