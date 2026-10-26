import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { HttpError } from './errors.ts';

export type Role = 'student' | 'teacher' | 'admin';
const ROLES: Role[] = ['student', 'teacher', 'admin'];

/** A signed-in person. The role comes ONLY from app_metadata, which users cannot edit; unknown roles fall back to student. */
export interface Actor { id: string; email: string | undefined; name: string | undefined; role: Role }

export interface Authenticator {
  authenticate(authorizationHeader: string | undefined): Promise<Actor>;
}

export function createAuthenticator(opts: { getKey: JWTVerifyGetKey; issuer: string }): Authenticator {
  return {
    async authenticate(header) {
      const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
      try {
        const { payload } = await jwtVerify(token, opts.getKey, { issuer: opts.issuer, audience: 'authenticated' });
        if (!payload.sub) throw new Error('no subject');
        const app = (payload.app_metadata ?? {}) as { role?: string; status?: string };
        if (app.status === 'disabled') throw new HttpError(403, 'account_disabled', 'This account is disabled');
        const role = ROLES.includes(app.role as Role) ? (app.role as Role) : 'student';
        // Display name only (user-editable, so never used for decisions): stripped of control characters and capped.
        const meta = (payload.user_metadata ?? {}) as { full_name?: unknown };
        const name = typeof meta.full_name === 'string' ? meta.full_name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || undefined : undefined;
        return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined, name, role };
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
