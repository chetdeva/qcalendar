# dashboard-service

The data behind the student and teacher dashboards. **This phase serves sample data from memory** (`src/mock.ts`, taken from the Figma design); nothing is stored and everything resets when the service restarts. The database and real endpoints replace the mock module in the next phase, behind the same API.

```bash
cp .env.example .env   # SUPABASE_URL (where login tokens are verified)
npm install
npm run dev            # http://localhost:3007
npm test
```

## API (`/v1`, bearer token; role from the token's `app_metadata.role`)

| | |
|---|---|
| `GET /dashboard?view=student\|teacher` | Students get the student dashboard, teachers the teacher one, admins either (default student). A student asking for `teacher` (or the reverse) is 403. The greeting name is the caller's own; the rest is sample data. |
| `GET /mentors?q=&filter=all\|middle\|olympiad\|whiteboard\|available` | Students. Search and quick filters. |
| `GET /students?q=&grade=all\|5..9` | Teachers. The student directory. |
| `POST /assignments {studentId, preset?, concept, dueDate, xp, prompt}` | Teachers. The student then sees it in their to-do list. |
| `POST /submissions/:id/draft` and `/publish {score 0-100, tags[], note}` | Teachers. Publishing removes the item from the grading queue (409 if already published) and adds feedback for the student. |
| `POST /__reset` | Sample data back to its start. Not available when `NODE_ENV=production`. |

Types are in `src/types.ts` (dashboard-ui keeps a copy).
