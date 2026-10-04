# calendar-ui

A Next.js calendar front end (FullCalendar) for [calendar-service](../calendar-service). It is a pure consumer of that service's HTTP API: nothing here imports code from the service folder, and the two deploy independently.

```
browser -> calendar-ui (Next.js route handlers, hold the API key) -> calendar-service /v1/*
```

- `lib/calendar.ts`: typed client for the service API (this app's own copy; the service ships a reference version in `calendar-service/client/`).
- `app/api/*`: server-side proxy routes, so the API key never reaches the browser.
- `app/calendar.tsx`: FullCalendar week/month/day views, drag-to-book, drag-to-reschedule, free-time shading.
- `app/components/`: the SyncSchedule design from Figma: utility bar (sync status, utilization, hours per session type), colour-coded lesson cards, and the New Lesson / Lesson details drawer.
- `public/icons/`: the design's icons, drawn as CSS masks so one file serves every state colour.

Session types (Tutoring, Office Hr, Personal) are the service's event `category`. The design's "Save as Draft Slot" button is not built: the service has no draft concept. The "Sync to Google Calendar" switch is read-only and shows whether the service is connected to Google.

## Run

```bash
npm install
cp .env.example .env.local   # CALENDAR_API_URL and CALENDAR_API_KEY of a running calendar-service
npm run dev                  # http://localhost:3002
```

There is no login: anyone who can reach this app can book and cancel events. Add authentication before exposing it.

## Tests

```bash
npm run test:e2e
```

Playwright drives the installed Google Chrome. The suite starts its own calendar-service (port 3100, throwaway database) from `../calendar-service`, and its own copy of this app (port 3102). Set `CALENDAR_SERVICE_DIR` to point at a different service checkout.
