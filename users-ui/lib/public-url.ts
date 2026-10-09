/**
 * Absolute URL on this app's public address. Behind a reverse proxy `request.url` says localhost:<port>, so production sets
 * NEXT_PUBLIC_APP_URL (for example https://accounts.quanttoria.com). Without it (local dev) the request's own address is used.
 * An absolute `path` (an allow-listed return address) is kept as it is.
 */
export const publicUrl = (path: string, request: { url: string }, appUrl = process.env.NEXT_PUBLIC_APP_URL) =>
  new URL(path, appUrl || request.url);
