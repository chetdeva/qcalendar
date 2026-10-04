# calendar-service

The scheduling backend for SyncSchedule: **each teacher has their own calendar, a class can have many students, and students get invitations and can accept or decline.**

Node 24 + TypeScript (runs `.ts` directly, no build step), [Hono](https://hono.dev), Postgres, `zod`. People sign in with Supabase; this service verifies their token and decides what they may see and change. Trusted backends (the booking app, the current calendar-ui) use a service API key.

```
people ──Supabase token──►  calendar-service  ──►  Postgres (schema "calendar")
backends ──service API key──►        │
                                     ├─► invitation emails with .ics files (SMTP, e.g. AWS SES)
                                     └─► signed webhooks to other apps
```

## Who can do what

| | Student | Teacher | Admin | Service key |
|---|---|---|---|---|
| See classes | Only ones they are invited to, and **only themselves in the roster** (plus a head count) | Their own | All | All |
| Create / move / cancel classes | No | Their own calendar | Any | Any (must name `ownerId`) |
| Add or remove students | No | Their own classes | Any | Any |
| Accept or decline an invitation | Yes | Yes, if invited | No | No |
| See when a teacher is free | Yes (free slots only) | Yes | Yes | Yes |
| Change calendar settings (hours, buffer, time zone) | No | Their own | Any teacher | Any teacher |

The role comes from the token's `app_metadata.role`, which people cannot edit. Anything a person is not allowed to see answers `404`, exactly like something that does not exist, so ids cannot be probed.

## What it does

- **Group classes.** Many students per class, each with their own accept/decline status. Students never see one another's emails: not in the API, and not in invitation emails (each `.ics` lists only its recipient).
- **No double-booking.** A teacher cannot be booked twice at the same time, and neither can a student. Back-to-back is fine. Creating or moving a class over a clash returns `409` unless `force: true`. The check is serialised per teacher, so simultaneous requests cannot both win. The student check reveals only *which students* are busy, never what they are busy with.
- **Reschedule and cancel.** A new time resets everyone's answer to "invited". Students are emailed an updated or cancelled invitation (same calendar entry, higher `SEQUENCE`, so Apple/Google/Outlook update or remove it). Changes people do not need to hear about (the category) send nothing.
- **Free slots.** `GET /v1/availability` computes each teacher's open times from their own working hours (default Mon to Fri, 9 to 17, in their time zone, daylight-saving safe), minus their booked classes and buffer.
- **Meeting links.** `meet: true` creates a unique Jitsi room (`MEETING_BASE_URL`); or pass your own `https` link (Zoom, Meet).
- **Invitations by email.** Queued in an outbox and sent by a background worker with retries (up to 8, exponential backoff), so a mail outage never loses an invitation or blocks booking.
- **Invite people who have no account yet.** A student can be added by email; once they sign in with that address, the class appears and is linked to their account.
- **Webhooks.** `event.created`, `event.updated`, `event.cancelled`, `event.responded`, HMAC-signed (`x-calendar-signature: sha256=…`), retried 8 times.

## API

All under `/v1`, `Authorization: Bearer <Supabase access token or service API key>`. Errors: `{"error":{"code","message","details"}}`. `GET /health` is open.

| Method | Path | Notes |
|---|---|---|
| POST | `/events` | `title`, `start`, `end` or `durationMinutes`, `participants:[{email,name?,userId?}]`, `meet`/`meetingUrl`, `category` (`tutoring`/`office_hours`/`personal`), `description`, `location`, `timezone`, `externalRef`, `force`, and for staff or the service key `ownerId` |
| GET | `/events` | `from`, `to`, `externalRef`, `includeCancelled=true`; staff also `ownerId`, `participant` |
| GET | `/events/:id` | |
| PATCH | `/events/:id` | Same fields, all optional |
| DELETE | `/events/:id` | Cancels (kept, status `cancelled`) |
| POST | `/events/:id/participants` | `{participants:[…], force?}`; only new people are invited |
| DELETE | `/events/:id/participants/:pid` | Removed student gets a cancellation |
| POST | `/events/:id/respond` | `{response:"accepted"\|"declined"}` |
| GET | `/availability` | `teacherId` (not needed for teachers), `from`, `to`, `duration` |
| GET / PUT | `/settings` | `?teacherId=` for staff and the service key |

A typed client is in [client/calendar-client.ts](client/calendar-client.ts).

### Legacy single-owner mode (temporary)

The current `calendar-ui` still talks to this service with the service key and the old request shape. To keep it working, a request with the service key and no `ownerId` acts on the teacher named by `DEFAULT_OWNER_ID`, `attendees` (emails) is accepted as an alias of `participants`, and responses carry the deprecated aliases `attendees` and `meetUrl`. Remove `DEFAULT_OWNER_ID` once that app uses real logins. The old Google Calendar sync is gone for now; it returns later as a per-teacher integration (it stays in git history).

## Run it

```bash
cd calendar-service
npm install
cp .env.example .env      # at minimum: API_KEY (openssl rand -hex 32)
npm run dev               # http://localhost:3000
```

With no `DATABASE_URL`, the service runs an **embedded Postgres in `./data/pglite`**, so there is nothing to install. Emails are only logged until `SMTP_URL` is set.

Production uses a real Postgres. For Supabase: Project, Connect, "Session pooler" connection string (works over IPv4) with your database password, into `DATABASE_URL`. The service creates and migrates its own `calendar` schema on startup (`migrations/`, tracked in `calendar.schema_migrations`); you can also apply the SQL yourself. The schema is not exposed through Supabase's public API, and the tables have row-level security with no policies and revoked grants for the browser roles, so only this service's own connection can read them.

| Setting | |
|---|---|
| `DATABASE_URL`, `DATABASE_SSL` | Postgres. SSL is `require` for remote hosts (encrypted, certificate not verified); use `verify` with `DATABASE_CA_CERT` for full verification |
| `SUPABASE_URL` | Where people's tokens are verified (public keys, no secret needed) |
| `API_KEY`, `DEFAULT_OWNER_ID` | Service key for trusted backends; legacy default teacher |
| `SMTP_URL`, `MAIL_FROM`, `CALENDAR_URL` | Invitation emails. AWS SES works through its SMTP interface |
| `MEETING_BASE_URL` | Jitsi server for generated links |
| `WEBHOOK_URL`, `WEBHOOK_SECRET` | Optional webhooks |

Run exactly one instance for now; the email and webhook workers are not coordinated across instances beyond row leasing.

### Moving the old SQLite data

```bash
npm run migrate-sqlite -- --sqlite ./data/dev.db --owner <teacher user id> --owner-email tess@school.org --owner-name "Tess Teacher"          # dry run
npm run migrate-sqlite -- --sqlite ./data/dev.db --owner <teacher user id> --owner-email tess@school.org --owner-name "Tess Teacher" --apply  # copy
```

Classes keep their ids and creation times, attendees become students, and nothing is emailed. Running it again skips what is already there.

## Test it

```bash
npm test            # 64 tests, about 10 seconds, no database or network needed
npm run typecheck
```

Tests run against a real Postgres engine (PGlite) with real signed tokens and an in-memory mailer. They cover: authentication (expired, forged, wrong issuer or audience, disabled accounts, `user_metadata` ignored, key comparison); the role matrix for every endpoint; privacy between teachers and between students (including that no other student's email appears anywhere); double-booking for teachers and students, adjacency, `force`, and a race of five simultaneous bookings; rescheduling, sequence numbers and who is emailed; cancel; adding and removing students; accept and decline; availability and settings per teacher, including time zones and buffers; the `.ics` files (escaping, folding, injection, one attendee each); email retries, leasing and header injection; webhooks (signing, retries); the legacy single-owner path; the migrations and database constraints; and the SQLite copy.

The security-critical rules were also checked by mutation: deliberately breaking each one (no visibility check, roster leak, no conflict check, students allowed to create) makes the suite fail.

## Deploy (one small AWS instance)

`docker compose up -d --build` runs the service behind Caddy (automatic HTTPS). Put `DATABASE_URL` and the other settings in `.env`, set `DOMAIN`, and point DNS at the instance. `NODE_ENV=production` makes the service refuse to start without `DATABASE_URL` and `SUPABASE_URL`. Backups are your database's: use Supabase's backups (daily on paid plans, point-in-time recovery as an add-on).

## Layout

```
migrations/0001_calendar.sql   schema, constraints, row-level security
src/app.ts                     routes and request validation
src/events.ts                  all the rules: who can see or change what, conflicts, notifications
src/auth.ts                    Supabase token verification, role from app_metadata, service key
src/db.ts                      Postgres (pg) and embedded Postgres (PGlite) behind one interface, migrations
src/ics.ts, mail.ts, outbox.ts invitation files, SMTP, retrying email queue
src/webhooks.ts                signed webhooks with retries
src/availability.ts            time-zone aware free-slot calculation
src/migrate-sqlite.ts          copy from the old single-owner database
```
