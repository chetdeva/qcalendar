# users-ui

Sign up, log in and account management for SyncSchedule: the front door shared by the calendar and (later) the class-booking app.

Next.js (App Router) + Supabase Auth. It talks to [users-service](../users-service) for everything about roles and people, and to Supabase directly only for the login itself.

```
browser ──login / sign up / Google / reset──►  Supabase Auth  ──► session cookie (shared across subdomains)
   │
   └──pages──► users-ui (Next.js server) ──user's own token──► users-service ──► roles, invitations, directory
```

## What it does

| Page | Who | What |
|---|---|---|
| `/signup` | anyone | Name, email, password, or Google. Creates a **student**; a confirmation email must be clicked first |
| `/login` | anyone | Email + password or Google. Honours `?next=` (see "Safe return addresses") |
| `/forgot-password`, `/reset-password` | anyone | Emailed reset link, then a new password. The same answer is shown whether or not the address has an account |
| `/accept-invite` | invited teachers and admins | Opened from the invitation email: set a name and password. The role applies once the email is confirmed |
| `/profile` | signed in | Name, time zone, and an optional guardian email. Email and role are read-only here |
| `/admin/users` | admins only | Search and filter users, change roles, disable/enable accounts, invite teachers or admins, revoke pending invitations |

Roles are `student` (default), `teacher` (by invitation) and `admin`. They are enforced by users-service; this app only decides what to show. Even a hand-crafted request to `/api/admin/*` is refused by the service for anyone who is not an admin.

## Single sign-on across the apps

Production uses subdomains of one domain, for example `accounts.<domain>` (this app), `calendar.<domain>` and later `classes.<domain>`. Every app uses `@supabase/ssr` with the same session-cookie settings, and `NEXT_PUBLIC_COOKIE_DOMAIN=.<domain>` scopes the cookie to the parent domain, so one login (and one sign-out) covers all of them. Locally, leave it empty: `localhost` cookies are shared across ports.

After login the visitor is sent back where they came from. Because that may be another app, `next` is allowed to be an absolute URL, but only for origins listed in `NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS`.

## Safe return addresses

`?next=` is the classic open-redirect hole. `lib/return-to.ts` accepts only a same-site path (one leading slash) or an allow-listed origin, and rejects `//evil.test`, `https://evil.test`, `https://allowed.example.com@evil.test`, userinfo, other ports or schemes, `javascript:`, backslashes, control characters and over-long values. It has unit tests, and the end-to-end suite tries the attacks against the real login.

## Setup

```bash
cd users-ui
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3003
```

You also need `users-service` running (`cd ../users-service && npm run dev`, port 3010).

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your project URL and **publishable** key (safe in the browser). Never put the secret key here |
| `USERS_SERVICE_URL` | users-service address (server-side only). Default `http://localhost:3010` |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.example.com` in production; empty locally |
| `NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS` | Comma-separated origins people may be sent back to, e.g. the calendar |
| `NEXT_PUBLIC_CALENDAR_URL` | Adds a "Calendar" link to the header |

Supabase dashboard settings (Confirm email, Google provider, redirect URLs, SMTP) are listed in [users-service/README.md](../users-service/README.md#2-supabase-dashboard-these-cannot-be-done-from-code). Add `http://localhost:3003/**` to the redirect URLs, or sign-in links will be refused.

## Tests

```bash
npm test          # 5 unit tests: safe redirects, cookie domain, validation (instant, no network)
npm run test:e2e  # 42 browser tests (about 45 seconds)
```

The browser tests need Google Chrome installed (Playwright drives it; nothing is downloaded). They do **not** use your Supabase project or send any email. `e2e/backend.mts` starts, in one process:

- a small fake of Supabase Auth: sign-up, password login, PKCE code exchange, refresh, recovery, Google "authorize", invite and confirmation links, signed ES256 tokens and a JWKS endpoint, and an inbox the tests read links from;
- the **real** users-service application code on an in-memory directory, with the database triggers simulated (profile on sign-up, invitation applied when the email is confirmed).

Everything runs on unusual ports (58731 to 58734) and refuses to start if one is taken, so the tests can never talk to some other service on your machine.

What the browser tests cover: sign-up, confirmation, resend and unconfirmed login; wrong passwords; Google; reset; sign-out (POST only); redirects for signed-out visitors; open-redirect attempts; profile editing and persistence; the guardian email; who can and cannot reach admin pages or APIs (student, teacher, anonymous, admin); role changes with the admin confirmation; disable/enable (a disabled user cannot log in); search, filters and paging; and the whole invitation journey (invite, email link, set password, role takes effect, revoke, expired and reused links).

## Layout

```
proxy.ts                      refreshes the session on every request; sends signed-out visitors to /login
lib/return-to.ts, cookies.ts, validation.ts   pure logic with unit tests
lib/supabase/                 browser and server clients (same cookie settings)
lib/bff.ts                    calls users-service with the signed-in user's own token
app/(auth)/                   login, signup, forgot/reset password, accept-invite
app/(app)/                    header + profile + admin/users (signed in)
app/api/                      thin server routes the pages call; the service decides what is allowed
app/auth/                     /callback (code exchange), /confirm (token_hash), /signout (POST)
e2e/                          Playwright specs and the fake backend
```

## Limits

- Emails (confirmation, reset, invitation) are sent by Supabase. Its built-in sender is for testing and is rate limited; use your own SMTP before real users sign up.
- No CAPTCHA or extra rate limiting beyond what Supabase applies to sign-up and login.
- A role change reaches a person's token on their next refresh (up to an hour). Admin pages check the database, so they are not affected.
- Re-inviting an address that signed up but never confirmed may be refused by Supabase; delete that unconfirmed user in the dashboard first.
