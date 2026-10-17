import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { HttpError } from './errors.ts';

/**
 * Who is calling: a person (signed Supabase token) or a trusted backend (the service API key). Chat knows people only
 * by their profile id. Roles, names and emails live in the users service and never enter this service.
 */
export type Actor = { kind: 'user'; id: string } | { kind: 'service' };

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface Authenticator {
  authenticate(authorizationHeader: string | undefined): Promise<Actor>;
}

export function createAuthenticator(opts: { apiKey: string; getKey: JWTVerifyGetKey; issuer: string }): Authenticator {
  return {
    async authenticate(header) {
      const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
      if (opts.apiKey && safeEqual(token, opts.apiKey)) return { kind: 'service' };
      try {
        const { payload } = await jwtVerify(token, opts.getKey, { issuer: opts.issuer, audience: 'authenticated' });
        if (!payload.sub) throw new Error('no subject');
        const app = (payload.app_metadata ?? {}) as { status?: string };
        if (app.status === 'disabled') throw new HttpError(403, 'account_disabled', 'This account is disabled');
        return { kind: 'user', id: payload.sub };
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
