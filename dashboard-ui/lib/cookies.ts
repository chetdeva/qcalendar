export interface SessionCookieOptions {
  domain?: string;
  path: string;
  sameSite: 'lax';
  secure: boolean;
}

/**
 * Single sign-on across subdomains comes down to one thing: the session cookie is scoped to the parent domain
 * (".example.com") so accounts., calendar. and later apps all read the same login. Leave the domain unset in
 * local development; browsers already share localhost cookies across ports.
 */
export function buildCookieOptions(domain: string | undefined, secure: boolean): SessionCookieOptions {
  const d = domain?.trim();
  if (d && (/[:/\s]/.test(d) || !d.includes('.'))) {
    throw new Error(`COOKIE_DOMAIN must be a bare domain like ".example.com" (got "${domain}")`);
  }
  return { ...(d ? { domain: d } : {}), path: '/', sameSite: 'lax', secure };
}

export const cookieOptions = () =>
  buildCookieOptions(process.env.NEXT_PUBLIC_COOKIE_DOMAIN, process.env.NODE_ENV === 'production');
