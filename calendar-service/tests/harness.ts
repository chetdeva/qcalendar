import { randomUUID } from 'node:crypto';
import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { createApp } from '../src/app.ts';
import { createAuthenticator, type Role } from '../src/auth.ts';
import { createPgliteDb, migrate } from '../src/db.ts';
import type { Ctx } from '../src/events.ts';
import { MemoryMailer } from '../src/mail.ts';
import { processOutbox } from '../src/outbox.ts';

export const ISS = 'https://project.supabase.co/auth/v1';
export const API_KEY = 'k'.repeat(32);
const { publicKey, privateKey } = await generateKeyPair('ES256');
export const foreignKey = (await generateKeyPair('ES256')).privateKey;

export async function signToken(sub: string, o: { role?: Role | string; status?: string; email?: string; name?: string; userMeta?: object; key?: CryptoKey; iss?: string; aud?: string; exp?: string } = {}) {
  return new SignJWT({
    email: o.email, app_metadata: { role: o.role, status: o.status ?? 'active' }, user_metadata: { full_name: o.name, ...o.userMeta },
  }).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(sub).setIssuer(o.iss ?? ISS).setAudience(o.aud ?? 'authenticated')
    .setIssuedAt().setExpirationTime(o.exp ?? '1h').sign(o.key ?? privateKey);
}

export type Call = (method: string, path: string, body?: unknown) => Promise<Response>;
export interface Person { id: string; email: string; token: string; call: Call }

export async function createHarness(opts: { webhooks?: boolean } = {}) {
  const db = createPgliteDb();
  await migrate(db);
  const ctx: Ctx = { db, defaultTimezone: 'UTC', webhooks: opts.webhooks ?? false, meetingBaseUrl: 'https://meet.example.test' };
  const app = createApp({ ctx, authenticator: createAuthenticator({ apiKey: API_KEY, getKey: async () => publicKey, issuer: ISS }) });
  const mailer = new MemoryMailer();

  const caller = (token: string): Call => (method, path, body) =>
    Promise.resolve(app.request(path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));

  async function person(role: Role, over: { id?: string; email?: string; name?: string } = {}): Promise<Person> {
    const id = over.id ?? randomUUID();
    const email = over.email ?? `${role}-${id.slice(0, 6)}@example.test`;
    const token = await signToken(id, { role, email, name: over.name ?? `${role} ${id.slice(0, 4)}` });
    return { id, email, token, call: caller(token) };
  }

  return {
    app, db, ctx, mailer, person,
    service: caller(API_KEY),
    withToken: caller,
    outbox: () => processOutbox(db, mailer, { fromEmail: 'no-reply@example.test', calendarUrl: 'https://calendar.example.test' }),
    async reset() {
      await db.exec('truncate calendar.events, calendar.event_participants, calendar.email_outbox, calendar.webhook_queue, calendar.teacher_settings restart identity cascade');
      mailer.sent.length = 0; mailer.failNext = 0; mailer.failAlways = false;
    },
    close: () => db.close(),
  };
}

/** A class on Monday 7 Jan 2030, `hour` UTC, for `minutes`. */
export const slot = (hour: number, minutes = 60, day = 7) => ({
  start: `2030-01-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00Z`,
  durationMinutes: minutes,
});

export const json = async (r: Response) => (await r.json()) as any;
