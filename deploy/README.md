# Deploying to AWS (one EC2 instance, Docker Compose, Caddy)

```
internet ──443──► Caddy (automatic HTTPS) ──► www.<domain>       home-ui
                                          ├─► accounts.<domain>  users-ui   ─┐ private Docker network
                                          └─► calendar.<domain>  calendar-ui ─┼─► users-service, calendar-service
                                                                              └─► Supabase (Auth + Postgres)
```

Only Caddy is reachable from the internet (80/443). The two APIs are called by the web apps over the private network.
`<domain>` is `DOMAIN` in `.env`: `quanttoria.com` in production, e.g. `test.quanttoria.com` for a dry run.
Login is shared across the subdomains through a cookie on `.<domain>`.

## 1. Server (already created)

EC2 `quanttoria-prod` (t4g.small, Ubuntu 24.04, 2 GB + 2 GB swap), Elastic IP `13.61.93.133`, security group `quanttoria-web`
(80/443 open, SSH only from the owner's IP), key `~/.ssh/quanttoria-prod.pem`. Docker and git are installed.

```bash
ssh -i ~/.ssh/quanttoria-prod.pem ubuntu@13.61.93.133
```

## 2. Settings on the server

`~/app/.env` (read by `docker compose`; keep it out of git):

```
DOMAIN=quanttoria.com
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
DATABASE_URL=<Supabase session pooler connection string, with the database password>
# Optional: SMTP_URL=<AWS SES SMTP url>  MAIL_FROM="Quanttoria <no-reply@quanttoria.com>"  DEFAULT_TIMEZONE=America/New_York
```

`~/app/users-service/.env` (holds the Supabase **secret** key; never in an image):

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret key>
```

## 3. Copy the code and start

From your Mac, in the repo root:

```bash
rsync -az --exclude node_modules --exclude .next --exclude .next-e2e --exclude .git --exclude '*/data' \
  -e "ssh -i ~/.ssh/quanttoria-prod.pem" ./ ubuntu@13.61.93.133:~/app/
```

On the server (build one image at a time; the instance has 2 GB):

```bash
cd ~/app
export COMPOSE_PARALLEL_LIMIT=1
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

## 4. DNS (Cloudflare) — records must be "DNS only" (grey cloud)

| Name | Type | Value |
|---|---|---|
| `@` (root) | A | `13.61.93.133` |
| `www` | A | `13.61.93.133` |
| `accounts` | A | `13.61.93.133` |
| `calendar` | A | `13.61.93.133` |

**Dry run first:** set `DOMAIN=test.quanttoria.com`, add `test`, `www.test`, `accounts.test`, `calendar.test` A records the same way,
rebuild (`--build`) and check the whole flow. Then switch `DOMAIN` to `quanttoria.com`, rebuild, and change the real records.
Changing the root and `www` replaces the live Vercel site: note their current values first so you can switch back.

## 5. Dashboard settings you must do

- **Supabase** (Authentication, URL configuration): Site URL `https://accounts.<domain>`; redirect URLs
  `https://accounts.<domain>/**` and `https://calendar.<domain>/**`. Google sign-in: add the same redirect URLs in the Google console.
- **Email:** verify `<domain>` in Amazon SES and add its DNS records in Cloudflare; put the SES SMTP URL in `.env`.

## Operating it

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=100 calendar-service
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build home-ui   # redeploy one app
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart caddy
```

Everything restarts by itself after a reboot (`restart: unless-stopped`). Run exactly one `calendar-service`.
