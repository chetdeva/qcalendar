import { randomUUID } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src/app.ts';
import { createAuthenticator, type Role } from '../src/auth.ts';
import { createPgliteDb, migrate } from '../src/db.ts';
import type { CalEvent, Person, Sources } from '../src/sources.ts';

export const ISS = 'https://project.supabase.co/auth/v1';
const { publicKey, privateKey } = await generateKeyPair('ES256');

export const signToken = (sub: string, o: { role?: Role | string; status?: string; name?: string; email?: string } = {}) =>
  new SignJWT({ email: o.email, app_metadata: { role: o.role, status: o.status ?? 'active' }, user_metadata: { full_name: o.name } })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(sub).setIssuer(ISS).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);

export type Call = (method: string, path: string, body?: unknown) => Promise<Response>;
export const json = async (r: Response) => (await r.json()) as any;

/** Stand-ins for calendar-service and users-service. Tests fill these in; nothing touches the network. */
export function stubSources() {
  const state = {
    events: [] as CalEvent[],
    /** teacher id -> ids of the people they share a class with */
    contacts: new Map<string, string[]>(),
    people: new Map<string, Person>(),
    guardians: new Map<string, { name: string | null; guardianEmail: string | null }>(),
    guardianFails: false,
  };
  const sources: Sources = {
    // The auth header carries the caller's id in tests: "Bearer <jwt>" is decoded by the harness's person().
    async events(auth) { return state.events.filter((e) => visibleTo(auth, e)); },
    async contacts(auth) { return state.contacts.get(callerOf(auth)) ?? []; },
    async people(_a, ids) { return new Map(ids.filter((i) => state.people.has(i)).map((i) => [i, state.people.get(i)!])); },
    async guardian(id) { if (state.guardianFails) throw new Error('users-service down'); return state.guardians.get(id) ?? null; },
  };
  const ids = new Map<string, string>(); // token -> person id
  const callerOf = (auth: string) => ids.get(auth.replace(/^Bearer /, '')) ?? '';
  const visibleTo = (auth: string, e: CalEvent) => { const me = callerOf(auth); return e.ownerId === me || e.participants.some((p) => p.userId === me); };
  return { state, sources, ids };
}

export async function createHarness(opts: { now?: Date } = {}) {
  const db = createPgliteDb();
  await migrate(db);
  const stub = stubSources();
  const clock = { now: opts.now ?? new Date('2030-03-15T10:00:00Z') };
  const app = createApp({
    ctx: { db, sources: stub.sources, now: () => clock.now, dashboardUrl: 'https://dashboard.example.test' },
    authenticator: createAuthenticator({ getKey: async () => publicKey, issuer: ISS }),
  });
  const caller = (token: string): Call => (method, path, body) =>
    Promise.resolve(app.request(path, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }));

  return {
    app, db, clock, ...stub,
    async person(role: Role, name = `${role} person`) {
      const id = randomUUID();
      const token = await signToken(id, { role, name, email: `${name.toLowerCase().replace(/\W+/g, '.')}@example.test` });
      stub.ids.set(token, id);
      stub.state.people.set(id, { id, name, email: `${name.toLowerCase().replace(/\W+/g, '.')}@example.test` });
      return { id, name, token, call: caller(token) };
    },
    withToken: caller,
    /** A confirmed class today, owned by the teacher, with these students. */
    classFor(teacher: { id: string; name: string }, students: { id: string; name: string }[], over: Partial<CalEvent> = {}): CalEvent {
      const e: CalEvent = {
        id: randomUUID(), ownerId: teacher.id, ownerName: teacher.name, title: 'Pythagorean Theorem', description: 'Right triangles and squares.', meetingUrl: 'https://meet.example.test/room',
        start: '2030-03-15T14:30:00.000Z', end: '2030-03-15T15:15:00.000Z', timezone: 'UTC', category: 'tutoring', status: 'confirmed',
        participants: students.map((s) => ({ userId: s.id, email: `${s.name}@example.test`, name: s.name, status: 'accepted' })), participantCount: students.length, ...over,
      };
      stub.state.events.push(e);
      stub.state.contacts.set(teacher.id, [...new Set([...(stub.state.contacts.get(teacher.id) ?? []), ...students.map((s) => s.id)])]);
      for (const s of students) stub.state.contacts.set(s.id, [...new Set([...(stub.state.contacts.get(s.id) ?? []), teacher.id])]);
      return e;
    },
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
