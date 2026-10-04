# calendar-service

A small calendar/booking API. Your apps (Next.js, tutoring software) create events with attendee emails; the service saves them and pushes them to your Google Calendar, which emails the invites (with Google Meet links).

Node 24 + TypeScript (no build step), Hono, SQLite (`node:sqlite`). Single owner, single API key.

## Run locally

```bash
npm install
cp .env.example .env     # set API_KEY (openssl rand -hex 32), DB_PATH=./data/calendar.db, PUBLIC_URL=http://localhost:3000
npm run dev
npm test
```

Without Google connected, events are saved with `syncStatus: "pending"` and pushed once you connect (invites go out then).

## Connect Google Calendar (once)

1. Google Cloud Console: create a project, enable the **Google Calendar API**.
2. OAuth consent screen: user type External, add yourself as a test user, then click **Publish app** (to "In production"). Otherwise refresh tokens expire after 7 days. Scopes used: `calendar.events`, `calendar.freebusy`. For a single user, no Google verification is needed (you'll see an "unverified app" warning; continue).
3. Credentials: create an **OAuth client ID** (Web application). Authorized redirect URI: `${PUBLIC_URL}/v1/google/callback`.
4. Put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`, restart.
5. Get the consent URL and open it in a browser:
   ```bash
   curl -H "Authorization: Bearer $API_KEY" $PUBLIC_URL/v1/google/connect
   ```
6. Check: `GET /v1/google/status` returns `connected: true`. Pending events sync automatically (also every 5 minutes; force with `POST /v1/google/sync`).

## API (all under `/v1`, `Authorization: Bearer <API_KEY>`)

| Method | Path | Notes |
|---|---|---|
| POST | `/events` | `title`, `start` (ISO with offset/Z), `end` or `durationMinutes`, `attendees[]`, `meet`, `description`, `location`, `timezone`, `externalRef`, `category` (`tutoring` default, `office_hours`, `personal`), `force`. `409` if overlapping unless `force: true`. |
| GET | `/events` | Filters: `from`, `to`, `externalRef`, `attendee`, `includeCancelled=true` |
| GET | `/events/:id` | |
| PATCH | `/events/:id` | Reschedule/edit; Google re-notifies attendees |
| DELETE | `/events/:id` | Cancels (row kept, status `cancelled`); Google notifies attendees |
| GET | `/availability?from&to&duration` | Free slots from working hours, minus bookings, Google busy time and buffer |
| GET/PUT | `/settings` | `timezone`, `workingHours`, `bufferMinutes`, `slotStepMinutes`, `webhookUrl`. Default Mon-Fri 09:00-17:00 |
| GET | `/google/connect`, `/google/status` | |
| POST | `/google/sync` | Push unsynced events |

`GET /health` is unauthenticated. Errors look like `{"error":{"code","message","details"}}`.

Conflict checks on create/PATCH cover events booked through this service. `/availability` also respects your other Google events via free/busy.

### Webhooks

Set `webhookUrl` (via `PUT /v1/settings`) or `WEBHOOK_URL`. The service POSTs `{id, type, createdAt, data}` for `event.created`, `event.updated`, `event.cancelled`. Verify the `x-calendar-signature: sha256=<hex HMAC of raw body>` header using `WEBHOOK_SECRET` (defaults to `API_KEY`). Failed deliveries retry with backoff up to 8 times.

## Use from Next.js (Vercel)

Copy [client/calendar-client.ts](client/calendar-client.ts) to `lib/calendar.ts`, set `CALENDAR_API_URL` and `CALENDAR_API_KEY` in Vercel env vars, and call it from route handlers / server actions only (never from the browser; the key is a secret). See [client/example-route.ts](client/example-route.ts).

## Deploy on AWS (one small instance)

SQLite needs a persistent disk, so use EC2 or Lightsail rather than Lambda. A `t4g.nano`/`micro` (or $5 Lightsail) is plenty.

1. Launch Amazon Linux 2023 (arm64 is fine). Security group: inbound 80, 443 and 22 (restrict to your IP). Attach an Elastic IP.
2. DNS: point an A record (e.g. `calendar.yourdomain.com`) at the IP.
3. Install Docker:
   ```bash
   sudo dnf install -y docker git && sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user   # re-login after
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64 -o /usr/local/lib/docker/cli-plugins/docker-compose
   sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   ```
   (use `docker-compose-linux-x86_64` on x86 instances)
4. Copy this project to the server (git clone or `scp`), then:
   ```bash
   cp .env.example .env && nano .env   # API_KEY, PUBLIC_URL, DOMAIN, DEFAULT_TIMEZONE, Google keys, S3_BUCKET
   mkdir -p data && sudo chown 1000:1000 data
   docker compose up -d --build
   ```
   Caddy obtains the HTTPS certificate automatically. Check `https://<domain>/health`.
5. Backups: create an S3 bucket, attach an IAM instance role allowing `s3:PutObject` on it, then add a cron entry (`crontab -e`):
   ```
   15 3 * * * /home/ec2-user/calendar-service/deploy/backup.sh >> /var/log/calendar-backup.log 2>&1
   ```
   (Add an S3 lifecycle rule to expire old backups.)
6. Update: `git pull && docker compose up -d --build`.

To restore, stop the stack and copy a backup file to `data/calendar.db`.

## Notes and limits

- Single owner and single calendar (`primary`). Multi-user would need per-user tokens and scoped keys.
- Run exactly one instance (SQLite, in-process workers).
- Rotate `API_KEY` by editing `.env` and restarting.
