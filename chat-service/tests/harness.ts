import { randomUUID } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import type { Policy } from '../src/chat.ts';
import { createPgliteDb, migrate } from '../src/db.ts';

export const ISS = 'https://project.supabase.co/auth/v1';
export const API_KEY = 'k'.repeat(32);
const { publicKey, privateKey } = await generateKeyPair('ES256');

export const signToken = (sub: string, o: { status?: string } = {}) =>
  new SignJWT({ app_metadata: { status: o.status ?? 'active' } })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(sub).setIssuer(ISS).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);

export type Call = (method: string, path: string, body?: unknown) => Promise<Response>;
export const json = async (r: Response) => (await r.json()) as any;

export async function createHarness() {
  const db = createPgliteDb();
  await migrate(db);
  // The policy is swappable per test; the default allows nothing.
  const state: { policy: Policy | undefined } = { policy: async () => false };
  const ctx = { db, get policy() { return state.policy; } };
  const app = createApp({ ctx, authenticator: createAuthenticator({ apiKey: API_KEY, getKey: async () => publicKey, issuer: ISS }) });

  const caller = (token: string): Call => (method, path, body) =>
    Promise.resolve(app.request(path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));

  return {
    app, db, state,
    async person() {
      const id = randomUUID();
      return { id, call: caller(await signToken(id)) };
    },
    service: caller(API_KEY),
    withToken: caller,
    reset: () => db.exec('truncate chat.conversations, chat.conversation_members, chat.messages restart identity cascade'),
    close: () => db.close(),
  };
}
