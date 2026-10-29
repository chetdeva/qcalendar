// One-time: sign in as the Google account that should own every class's Meet link and print its refresh token.
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment (the same OAuth client as Google sign-in, with
// http://localhost:53682/ added as an authorised redirect URI and the Calendar API enabled). The token is printed, not stored.
import { createServer } from 'node:http';

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.'); process.exit(1); }
const redirect = 'http://localhost:53682/';

const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
url.search = new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/calendar.events',
}).toString();
console.log(`Open this address and approve with the meeting account:\n\n${url}\n`);

const server = createServer(async (req, res) => {
  const code = new URL(req.url ?? '/', redirect).searchParams.get('code');
  if (!code) { res.end('Waiting for approval...'); return; }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const j = await r.json();
  res.end(j.refresh_token ? 'Done. You can close this tab and go back to the terminal.' : 'No refresh token. See the terminal.');
  if (j.refresh_token) console.log(`GOOGLE_REFRESH_TOKEN=${j.refresh_token}\n\nPut that line in .env.`);
  else console.error('Google returned no refresh token:', j.error_description ?? j.error ?? 'unknown error');
  server.close();
});
server.listen(53682);
