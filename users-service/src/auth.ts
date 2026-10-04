import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { HttpError } from './errors.ts';

export type Role = 'student' | 'teacher' | 'admin';
const ROLES: Role[] = ['student', 'teacher', 'admin'];

export interface Principal {
  id: string;
  email: string | undefined;
  role: Role;
  status: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<Principal>;
}

/**
 * The role is read ONLY from app_metadata, which users cannot edit (it is written by database triggers and the
 * service role). user_metadata is ignored on purpose. A missing or unknown role is treated as the least privileged one.
 */
export function principalFrom(payload: JWTPayload): Principal {
  if (!payload.sub) throw new HttpError(401, 'unauthorized', 'Token has no subject');
  const app = (payload.app_metadata ?? {}) as { role?: string; status?: string };
  const role = ROLES.includes(app.role as Role) ? (app.role as Role) : 'student';
  return { id: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined, role, status: app.status ?? 'active' };
}

export function createVerifier(getKey: JWTVerifyGetKey, issuer: string): TokenVerifier {
  return {
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, getKey, { issuer, audience: 'authenticated' });
        return principalFrom(payload);
      } catch (e) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(401, 'unauthorized', 'Invalid or expired token');
      }
    },
  };
}

/** Verifies Supabase access tokens against the project's public JWKS (asymmetric signing keys). */
export function createSupabaseVerifier(supabaseUrl: string): TokenVerifier {
  const base = supabaseUrl.replace(/\/$/, '');
  return createVerifier(createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`)), `${base}/auth/v1`);
}
