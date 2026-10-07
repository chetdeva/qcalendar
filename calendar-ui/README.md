# calendar-ui

The SyncSchedule calendar for teachers, students and admins. Next.js (App Router) + FullCalendar, built from the Figma design. People sign in through [users-ui](../users-ui); this app shows each of them the right view and talks to [calendar-service](../calendar-service) and [users-service](../users-service) **as that person**.

```
browser ──► calendar-ui (Next.js server) ──person's own token──► calendar-service   classes, answers, free slots
   │                     └───────────────person's own token──► users-service        who is who, student search
   └─ signed out? ──► users-ui login ──► back here
```

There is no API key in this app any more. Every request to either service carries the signed-in person's token, so each service decides what that person may see and do; this app only decides what to show.

## What each role sees

| Role | View |
|---|---|
| **Teacher** | Their own calendar (week, month, day). Create classes with a **student picker** (search by name or email, or invite someone who has not signed up yet), drag to book, drag or resize to reschedule, click a class to see who **accepted, declined or has not answered**, add or remove students, cancel. Free times are shaded from the teacher's own hours. |
| **Student** | **My classes**: classes waiting for an answer first, then upcoming ones, each with **Accept** and **Decline** (changeable any time), the teacher, time and video link, plus a read-only calendar. Students never see other students, and cannot create or change anything. |
| **Admin** | Every teacher's classes, with the teacher's name on each. Choose a teacher to create a class on their behalf; add or remove students on, move, or cancel any class. |

A class with several students shows a head count to the students ("3 students"), never names or emails.

## How login works

- **Signed out**: the proxy sends the visitor to `users-ui/login?next=<the page they wanted>`, which sends them straight back after login.
- **Session**: the same Supabase session cookie as users-ui, so one login covers both apps. In production they live on subdomains of one domain and set `NEXT_PUBLIC_COOKIE_DOMAIN=.example.com` (the same value in both); locally, `localhost` cookies are shared across ports.
- **Account and sign out** are links to users-ui (`/profile`, and a POST to `/auth/signout`).
- **Roles** come from users-service (`GET /v1/me`), which reads them from the database; a request that is not allowed is refused by the service, not just hidden in the UI.

The server routes under `app/api/` only forward. Two are worth knowing: `/api/students` cuts what users-service returns down to id, name and email (so an admin's view of a guardian address can never reach the browser), and `/api/teachers` checks the caller really is an admin first (users-service ignores the role filter for non-admins and would hand back students).

## Run it

You need the other services running: `calendar-service` (port 3000), `users-service` (3010) and `users-ui` (3003), each with its own `.env` (see their READMEs).

```bash
cd calendar-ui
npm install
cp .env.example .env.local   # fill in the Supabase URL and publishable key
npm run dev                  # http://localhost:3002
```

Add `http://localhost:3002/**` to the redirect URLs in Supabase, and `NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS=http://localhost:3002` in users-ui, or login will refuse to send people back here.

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your project and its **publishable** key |
| `NEXT_PUBLIC_USERS_UI_URL` | Login, account and sign-out live here |
| `NEXT_PUBLIC_COOKIE_DOMAIN` | `.example.com` in production, empty locally; same as users-ui |
| `CALENDAR_API_URL`, `USERS_SERVICE_URL` | The backend services |

## Test it

```bash
npm run test:e2e   # 45 browser tests, about 45 seconds
```

Playwright drives the installed Google Chrome (nothing is downloaded). The suite starts, on unusual ports (58741 to 58745), and refuses to start if one is taken:

- a small fake of Supabase Auth, and the **real users-service code** on an in-memory directory;
- the **real calendar-service** on an embedded Postgres in a throwaway folder, verifying tokens against the fake;
- a stand-in for users-ui (login, account, POST-only sign-out);
- this app.

Tests get a signed-in browser by obtaining a real token and writing the session cookies with the same Supabase library the app uses, so the app cannot tell it from a real login. Nothing touches your Supabase project, and no email is sent.

What is covered: the redirect to login and the way back; tampered cookies; `401` on every route when signed out; each role's view and the controls it must not have; teacher flows (picker search and keyboard use, inviting by email, validation, group classes, overlap and busy-student prompts, roster with answers, add and remove students, cancel, drag to reschedule, isolation from other teachers, video link, top-bar numbers, free-time shading); student flows (answers saved and changeable, reschedule asks again, cancelled and past classes, video link, classes invited by email before sign-up, no other students visible anywhere, read-only calendar, direct calls to the server refused); admin flows (all classes, create on behalf with only teachers offered, manage any class); and the server-side safety rules. Three of those rules were also checked by deliberately breaking them and watching the tests fail.

## Layout

```
proxy.ts                         refreshes the session; signed-out visitors go to users-ui login
app/page.tsx                     picks the view for the signed-in role
app/teacher-calendar.tsx         teachers and admins
app/student-home.tsx             students: My classes + read-only calendar
app/components/                  top bar, toolbar, drawers (create, details, roster), student picker, event cards
app/api/                         server routes that forward to the services with the person's token
lib/bff.ts, lib/supabase/        token forwarding, session handling
e2e/                             Playwright specs, fake backend, helpers
```

## Limits

- Emails (invitations, updates, cancellations) are sent by calendar-service, not here. If it has no mail settings, they are only logged.
- Students answer in the app; replying to the email does nothing yet.
- Times are shown in the browser's time zone; free-time shading uses the teacher's own time zone setting.
- A role change reaches the services when the person's token refreshes (up to an hour); users-service admin pages check the database so they are not affected.
