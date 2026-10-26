# dashboard-service

The data behind the student and teacher dashboards: tasks, hand-ins, grades, mentor profiles and the numbers computed from them. Classes come from calendar-service and names from users-service (each called with the signed-in person's own token); the guardian's email, for the parent-sync message, comes from users-service with a shared key.

```bash
cp .env.example .env   # SUPABASE_URL, CALENDAR_API_URL, USERS_SERVICE_URL (+ the optional keys inside)
npm install
npm run dev            # http://localhost:3007, embedded Postgres in ./data/pglite when DATABASE_URL is empty
npm test               # embedded Postgres, calendar and users stubbed, no setup
```

Data lives in the `dashboard` schema of the same Postgres as calendar and chat. Migrations in `migrations/` run on start.

## API (`/v1`, bearer token; role from the token's `app_metadata.role`, exact: admins can look at both dashboards but never act as a student or teacher)

| | |
|---|---|
| `GET /dashboard?view=student\|teacher` | Students get the student dashboard, teachers the teacher one, admins either (default student). |
| `GET /mentors?q=&filter=all\|elementary\|middle\|high\|olympiad` | Students. Published teacher profiles, the student's own coach first. |
| `GET /students?q=&grade=all\|1..10` | Teachers. People from their classes with mastery, AQ tier and progress. |
| `POST /assignments {studentId, preset?, concept, dueDate, xp, prompt}` | Teachers, for students they share a class with. |
| `GET /assignments`, `GET /assignments/:id` | Students: their own tasks (others look like they do not exist). |
| `POST /assignments/:id/progress {stepsDone}`, `POST /assignments/:id/submit {answer, attachmentId?}` | Students; a task is handed in once. |
| `POST /attachments {contentType, data}`, `GET /attachments/:id` | Students upload png, jpeg or webp up to 1.5 MB (type checked from the bytes); only the owner and the assigning teacher can read it. |
| `POST /submissions/:id/draft`, `POST /submissions/:id/publish {score 0-100, tags[], note}` | The teacher who assigned the task. Publishing happens once and queues an email to the guardian when one is on file (`parentSync`: `sent`, `no_guardian` or `failed`; the grade is published regardless). |
| `GET/PUT /me/mentor-profile`, `PUT /students/:id/settings {grade}` | Teachers. |

## The numbers (rules in `src/metrics.ts`, tested with fixed dates)
- **Points**: XP of graded tasks. **Streak**: consecutive days with a progress save or a hand-in, counted back from today or yesterday.
- **Weekly goal**: tasks handed in over the last 7 days against `weekly_target` (default 5).
- **Mastery**: average of the last 10 scores. **Unit progress**: graded over assigned tasks in the last 30 days.
- **AQ (0-100)**: half the share of the last 10 graded tasks tagged "High Adversity Quotient (AQ)", half the share of the last 10 assigned tasks handed in. Tiers: 80+ High Resilience, 60-79 Growing Steadily, below Building Confidence.
- **Student AQ growth**: average AQ over the last 30 days minus the 30 days before.

Types are in `src/types.ts` (dashboard-ui keeps a copy).
