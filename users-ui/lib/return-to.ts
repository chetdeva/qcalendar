/**
 * "Where to go after signing in" must never become an open redirect. Because login is shared by several apps on
 * sibling subdomains, a return address may be absolute, but only to an origin on an explicit allow-list.
 */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      try {
        const u = new URL(s);
        return u.protocol === 'http:' || u.protocol === 'https:' ? [u.origin] : [];
      } catch {
        return [];
      }
    });
}

export function safeNext(next: string | null | undefined, allowedOrigins: string[], fallback = '/profile'): string {
  if (!next || typeof next !== 'string' || next.length > 2048) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next) || next.includes('\\')) return fallback;
  // Same-site path: one leading slash, not protocol-relative ("//evil.test").
  if (next.startsWith('/') && !next.startsWith('//')) return next;
  try {
    const u = new URL(next);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password && allowedOrigins.includes(u.origin)) {
      return u.toString();
    }
  } catch {
    // not a URL
  }
  return fallback;
}
