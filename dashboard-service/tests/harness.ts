import { randomUUID } from 'node:crypto';
import { generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../src/app.ts';
import { createAuthenticator, type Role } from '../src/auth.ts';
import { createMockStore } from '../src/mock.ts';

export const ISS = 'https://project.supabase.co/auth/v1';
const { publicKey, privateKey } = await generateKeyPair('ES256');

export const signToken = (sub: string, o: { role?: Role | string; status?: string; name?: string; email?: string } = {}) =>
  new SignJWT({ email: o.email, app_metadata: { role: o.role, status: o.status ?? 'active' }, user_metadata: { full_name: o.name } })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(sub).setIssuer(ISS).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);

export type Call = (method: string, path: string, body?: unknown) => Promise<Response>;
export const json = async (r: Response) => (await r.json()) as any;

export function createHarness(opts: { production?: boolean } = {}) {
  const store = createMockStore();
  const app = createApp({ store, production: opts.production ?? false, authenticator: createAuthenticator({ getKey: async () => publicKey, issuer: ISS }) });
  const caller = (token: string): Call => (method, path, body) =>
    Promise.resolve(app.request(path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
  return {
    app, store,
    async person(role: Role, name = `${role} person`) {
      const id = randomUUID();
      return { id, call: caller(await signToken(id, { role, name, email: `${role}@example.test` })) };
    },
    withToken: caller,
  };
}
