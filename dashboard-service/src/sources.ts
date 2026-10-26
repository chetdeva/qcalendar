import { HttpError } from './errors.ts';

/** A class as calendar-service describes it to the person asking. Only the fields the dashboards use. */
export interface CalEvent {
  id: string;
  ownerId: string;
  ownerName: string | null;
  title: string;
  description: string | null;
  meetingUrl: string | null;
  start: string;
  end: string;
  timezone: string;
  category: 'tutoring' | 'office_hours' | 'personal';
  status: 'confirmed' | 'cancelled';
  participants: { userId: string | null; email: string; name: string | null; status: string }[];
  participantCount: number;
  myStatus?: string | null;
}

export interface Person { id: string; name: string; email: string }

/**
 * Everything the dashboards read from other services. Each call forwards the signed-in person's OWN token, so those
 * services decide what that person may see. Injected, so tests use a stub instead of the network.
 */
export interface Sources {
  events(auth: string, from: Date, to: Date): Promise<CalEvent[]>;
  /** Ids of the people this person shares a class with (calendar-service decides). */
  contacts(auth: string): Promise<string[]>;
  people(auth: string, ids: string[]): Promise<Map<string, Person>>;
  /** Backend to backend, with the shared key: the guardian's email, for the parent-sync message. */
  guardian(studentId: string): Promise<{ name: string | null; guardianEmail: string | null } | null>;
}

const root = (u: string) => u.replace(/\/$/, '');

export function httpSources(o: { calendarUrl: string; usersUrl: string; usersKey?: string }): Sources {
  async function get<T>(base: string, path: string, headers: Record<string, string>, method = 'GET', body?: unknown): Promise<{ status: number; json: T }> {
    try {
      const res = await fetch(`${root(base)}${path}`, { method, headers: { ...headers, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
    } catch {
      throw new HttpError(502, 'upstream', 'A service the dashboard needs is unreachable. Try again in a moment.');
    }
  }
  return {
    async events(auth, from, to) {
      const r = await get<{ events?: CalEvent[] }>(o.calendarUrl, `/v1/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { authorization: auth });
      if (r.status !== 200) throw new HttpError(502, 'upstream', 'Could not load classes.');
      return r.json.events ?? [];
    },
    async contacts(auth) {
      const r = await get<{ contacts?: { id: string }[] }>(o.calendarUrl, '/v1/contacts', { authorization: auth });
      if (r.status !== 200) throw new HttpError(502, 'upstream', 'Could not load classes.');
      return (r.json.contacts ?? []).map((c) => c.id);
    },
    async people(auth, ids) {
      const unique = [...new Set(ids)];
      const out = new Map<string, Person>();
      // users-service answers up to 50 people per request.
      for (let i = 0; i < unique.length; i += 50) {
        const r = await get<{ users?: { id: string; full_name: string | null; email: string }[] }>(o.usersUrl, '/v1/users/lookup', { authorization: auth }, 'POST', { ids: unique.slice(i, i + 50) });
        if (r.status !== 200) continue; // names are nice to have: never fail a dashboard over them
        for (const u of r.json.users ?? []) out.set(u.id, { id: u.id, name: u.full_name?.trim() || u.email, email: u.email });
      }
      return out;
    },
    async guardian(studentId) {
      if (!o.usersKey) return null;
      const r = await get<{ name: string | null; guardianEmail: string | null }>(o.usersUrl, `/v1/service/students/${encodeURIComponent(studentId)}/guardian`, { authorization: `Bearer ${o.usersKey}` });
      return r.status === 200 ? r.json : null;
    },
  };
}
