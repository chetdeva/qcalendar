import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { HttpError } from './errors.ts';

export type Role = 'student' | 'teacher' | 'admin';
const ROLES: Role[] = ['student', 'teacher', 'admin'];

/**
 * Who is calling. A person (signed Supabase token) or a trusted backend (the service API key, used by the booking
 * app and by the legacy single-owner calendar-ui).
 */
export type Actor =
  | { kind: 'user'; id: string; email: string | undefined; name: string | undefined; role: Role }
  | { kind: 'service' };

export const isManager = (a: Actor) => a.kind === 'service' || a.role === 'admin';

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface Authenticator {
  authenticate(authorizationHeader: string | undefined): Promise<Actor>;
}

/**
 * The role is read ONLY from app_metadata, which users cannot edit (written by database triggers and the service
 * role). user_metadata is ignored on purpose. Missing or unknown roles fall back to the least privileged one.
 */
export function createAuthenticator(opts: { apiKey: string; getKey: JWTVerifyGetKey; issuer: string }): Authenticator {
  return {
    async authenticate(header) {
      const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
      if (opts.apiKey && safeEqual(token, opts.apiKey)) return { kind: 'service' };
      try {
        const { payload } = await jwtVerify(token, opts.getKey, { issuer: opts.issuer, audience: 'authenticated' });
        if (!payload.sub) throw new Error('no subject');
        const app = (payload.app_metadata ?? {}) as { role?: string; status?: string };
        if (app.status === 'disabled') throw new HttpError(403, 'account_disabled', 'This account is disabled');
        const role = ROLES.includes(app.role as Role) ? (app.role as Role) : 'student';
        // Display name only (user-editable, so never used for decisions): stripped of control characters and capped.
        const meta = (payload.user_metadata ?? {}) as { full_name?: unknown };
        const name = typeof meta.full_name === 'string' ? meta.full_name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || undefined : undefined;
        return { kind: 'user', id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined, name, role };
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(401, 'unauthorized', 'Invalid or expired token');
      }
    },
  };
}

/** Verifies Supabase access tokens against the project's public JWKS (asymmetric signing keys). */
export function supabaseKeys(supabaseUrl: string) {
  const base = supabaseUrl.replace(/\/$/, '');
  return { getKey: createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`)), issuer: `${base}/auth/v1` };
}
