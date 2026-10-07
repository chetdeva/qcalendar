# users-service

Shared accounts and roles for the calendar and (later) the teacher-student booking app.

Supabase Auth owns sign-up, login, Google sign-in, email verification and password reset. This service owns what Supabase should not do from a browser: **roles, invitations, admin user management and the user directory**. It is a small Hono service (Node 24, TypeScript, no build step) that talks to Supabase with the secret key, so that key never reaches a browser.

```
users-ui (Next.js)  ──sign up / log in──►  Supabase Auth ──► access token (JWT, role in app_metadata)
       │                                        │
       └──admin / profile calls (server side)──►  users-service  ──secret key──►  Supabase Postgres (profiles, invitations)
other services verify the same JWT against Supabase's public keys
```

## Roles and how they are enforced

| Role | How someone gets it |
|---|---|
| `student` | Default for every sign-up (email + password, or Google) |
| `teacher` | An admin invites their email; the role applies once that email is **confirmed** |
| `admin` | Invited by another admin, or the first one created with `npm run make-admin` |

- The role lives in `public.profiles`. Only this service (secret key) and the database triggers can write it. Row level security and revoked grants stop every browser client from writing, from reading anyone else's profile, and from touching `invitations`.
- A trigger mirrors the role into `auth.users.raw_app_meta_data`, so it is in the access token as `app_metadata.role`. **`user_metadata` is editable by users, so it is never used for roles.**
- An invitation only grants its role when the invited email is confirmed, so signing up with someone else's address does not claim their invitation.
- A token can be up to an hour old, so **admin routes check the database**, not the token. A demoted admin loses admin powers immediately.
- Disabling a user sets `status = disabled` and bans them in Supabase Auth, so they cannot refresh their session; their token claim also flips to disabled and this service refuses it.
- The last active admin can never be demoted or disabled (checked here and by a database trigger).
- Students' data is minimal: email, name, role, status, timezone, and an optional `guardian_email` (visible only to the student and admins; teachers never see it).

## API

All routes need `Authorization: Bearer <Supabase access token>` except `/health`. Errors look like `{"error":{"code","message","details"}}`.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/v1/me` | any | Own profile |
| PATCH | `/v1/me` | any | `full_name`, `timezone`, `guardian_email` (null clears). Any other key (role, status, email, id) is a 400 |
| GET | `/v1/users?q=&role=&status=&limit=&offset=` | admin, teacher | Admin: everyone, full profiles. Teacher: active students only, `{id, full_name, email}`. Student: 403 |
| GET | `/v1/users/:id` | self, admin, teacher | A teacher asking about anyone who is not an active student gets 404 |
| PATCH | `/v1/users/:id/role` | admin | `{role}`. Not your own role |
| POST | `/v1/users/:id/disable`, `/enable` | admin | Not yourself |
| POST | `/v1/invitations` | admin | `{email, role: teacher or admin}`. Sends the Supabase invitation email. 409 if the email already has an account or a pending invitation |
| GET | `/v1/invitations?status=` | admin | |
| DELETE | `/v1/invitations/:id` | admin | Revokes a pending invitation |

## Setup

### 1. Database (already applied to the Quanttoria project)

`migrations/0001_identity.sql` creates `profiles`, `invitations`, the triggers and the access rules. Apply it to any other Supabase project with the SQL editor or `supabase db push`.

Check it with the rolled-back SQL tests: run `tests/sql/identity.test.sql` in the SQL editor. It passes when the only error is `ALL_IDENTITY_TESTS_PASSED`, and it leaves no data behind. It expects a database with no admins yet.

### 2. Supabase dashboard (these cannot be done from code)

1. **Authentication → Sign In / Providers**
   - Email: enabled, **Confirm email ON**.
   - Google: enabled. Create an OAuth client in Google Cloud (type Web application) with the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` and paste its ID and secret. Only the basic scopes (openid, email, profile) are used, so no Google app review is needed.
   - **Allow anonymous sign-ins: OFF.**
2. **Authentication → URL Configuration**
   - Site URL: your `users-ui` URL.
   - Redirect URLs: `http://localhost:3003/**`, `https://accounts.<your-domain>/**`, `https://calendar.<your-domain>/**`.
3. **Authentication → SMTP**: Supabase's built-in email sender is for testing and heavily rate limited. Use your own SMTP (for example AWS SES) before real users sign up.
4. **Project Settings → API Keys**: copy the **secret** key into this service's `.env`. Never put it in a UI.

### 3. Run

```bash
cd users-service
npm install
cp .env.example .env     # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INVITE_REDIRECT_URL
npm run dev              # http://localhost:3010
npm test                 # 19 tests, no network or Supabase needed
```

### 4. Create the first admin

Sign up once (users-ui, or Authentication → Users → Add user in the dashboard), then:

```bash
npm run make-admin -- you@example.com
```

Sign out and in again so the new role reaches your token. After that, invite teachers from the admin page or `POST /v1/invitations`.

## Single sign-on across the apps (subdomains)

Production uses subdomains of one domain, for example `accounts.<domain>` (users-ui), `calendar.<domain>` (calendar-ui) and later `classes.<domain>`. Each Next.js app uses `@supabase/ssr` with the session cookie's domain set to `.<domain>`, so one login serves them all. Locally the apps run on different ports of `localhost`, which already share cookies, so no extra setup is needed. The cookie domain will be a `COOKIE_DOMAIN` setting in the UIs (phase 2).

## Layout

```
migrations/0001_identity.sql   schema, triggers, row level security
tests/sql/identity.test.sql    rolled-back database tests
src/app.ts                     routes and permission rules
src/auth.ts                    token verification (JWKS), role from app_metadata only
src/directory.ts               the storage interface; supabase-directory.ts is the real implementation
src/app.test.ts                19 API tests with signed tokens and an in-memory directory
tests/memory-directory.ts      in-memory directory mirroring the database rules
scripts/make-admin.ts          bootstrap the first admin
```

## Limits

- No rate limiting on this service's own routes; Supabase rate-limits sign-up and login itself. Add a limiter before exposing admin routes publicly.
- A role change reaches the person's token on their next refresh (at most an hour). Admin routes are not affected because they check the database.
- Re-inviting an email that signed up but never confirmed can return `email_exists`; an admin can delete that unconfirmed user in the dashboard first.
