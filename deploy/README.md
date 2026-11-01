# Deploying to AWS (one EC2 instance, Docker Compose, Caddy)

```
internet ──443──► Caddy (automatic HTTPS) ──► www.<domain>       home-ui
                                          ├─► accounts.<domain>  users-ui   ─┐ private Docker network
                                          ├─► calendar.<domain>  calendar-ui ─┼─► users-service, calendar-service
                                          ├─► chat.<domain>      chat-ui ─────┤   chat-service (asks calendar-service who may talk)
                                          └─► dashboard.<domain> dashboard-ui ┘   dashboard-service (its own `dashboard` schema)
                                                                              └─► Supabase (Auth + Postgres)
```

Only Caddy is reachable from the internet (80/443). The APIs are called by the web apps over the private network.
`<domain>` is `DOMAIN` in `.env`: `quanttoria.com` in production, e.g. `test.quanttoria.com` for a dry run.
Login is shared across the subdomains through a cookie on `.<domain>`.

## 1. Server (already created)

EC2 `quanttoria-web` in **us-west-1** (N. California), t4g.small, Ubuntu 24.04, 2 GB + 2 GB swap, Elastic IP `184.169.166.191`,
security group `quanttoria-web` (80/443 open, SSH only from the owner's IP), key `~/.ssh/quanttoria-prod.pem`. Docker is installed.
It sits next to the Supabase database (also us-west-1), so a query takes 1-2 ms instead of ~175 ms from Europe, and the users are in the US.
The first server was in eu-north-1 (Stockholm) and was retired on 2026-10-31.

```bash
ssh -i ~/.ssh/quanttoria-prod.pem ubuntu@184.169.166.191
```

## 2. Settings on the server

`~/app/.env` (read by `docker compose`; keep it out of git):

```
DOMAIN=quanttoria.com
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
DATABASE_URL=<Supabase session pooler connection string, with the database password>
# Optional: SMTP_URL=<AWS SES SMTP url>  MAIL_FROM="Quanttoria <no-reply@quanttoria.com>"  DEFAULT_TIMEZONE=America/New_York
# Optional: USERS_SERVICE_API_KEY=<random secret, openssl rand -hex 32>  lets the dashboard email a student's guardian when a grade is
#           published (users-service and dashboard-service both read it). Without it grades still publish; parents are not emailed.
# Cloudflare Web Analytics (cookie-free visit counts, www only; public id, not a secret): CF_ANALYTICS_TOKEN=9b781c9d867646d9b2f8308e45a2e51e
# Optional (billing, off by default): BILLING_SERVICE_KEY=<openssl rand -hex 32>  COMPOSE_PROFILES=billing  BILLING_GATEWAY=<gateway name>
#   plus that gateway's own keys. Needs USERS_SERVICE_API_KEY too. Run migration users-service/migrations/0003_grade.sql first. Without
#   BILLING_SERVICE_KEY the billing service does not start and every lesson stays free. Webhook URL to give the gateway:
#   https://accounts.<domain>/api/webhooks/billing/<gateway name> (Cashfree: also CASHFREE_CLIENT_ID, CASHFREE_CLIENT_SECRET, CASHFREE_ENV=sandbox; Razorpay: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET)
# Optional: FILES_BUCKET=<bucket>  FILES_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com  FILES_ACCESS_KEY_ID=...  FILES_SECRET_ACCESS_KEY=...
#   keeps students' uploaded work (pictures, PDFs) in a private Cloudflare R2 bucket instead of the database. For Amazon S3 leave FILES_ENDPOINT
#   empty and set FILES_REGION=eu-north-1. Existing uploads stay in the database and keep working.
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
  -e "ssh -i ~/.ssh/quanttoria-prod.pem" ./ ubuntu@184.169.166.191:~/app/
```

**Do not build on the server.** Two gigabytes is not enough for the Next.js builds: a second build exhausted memory and took the site down.
Build the images on your Mac (it is arm64, like the server) and send them instead, see "Deploying without building on the server" below.
The `--build` steps in this README are only for a first setup on a bigger machine. On the server (one image at a time):

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
| `@` (root) | A | `184.169.166.191` |
| `www` | A | `184.169.166.191` |
| `accounts` | A | `184.169.166.191` |
| `calendar` | A | `184.169.166.191` |
| `chat` | A | `184.169.166.191` |
| `dashboard` | A | `184.169.166.191` |

**Dry run first:** set `DOMAIN=test.quanttoria.com`, add `test`, `www.test`, `accounts.test`, `calendar.test`, `chat.test`, `dashboard.test` A records the same way,
rebuild (`--build`) and check the whole flow. Then switch `DOMAIN` to `quanttoria.com`, rebuild, and change the real records.
Changing the root and `www` replaces the live Vercel site: note their current values first so you can switch back.

## 5. Dashboard settings you must do

- **Supabase** (Authentication, URL configuration): Site URL `https://accounts.<domain>`; redirect URLs
  `https://accounts.<domain>/**`, `https://calendar.<domain>/**`, `https://chat.<domain>/**` and `https://dashboard.<domain>/**`. Google sign-in: add the same redirect URLs in the Google console.
- **Email:** verify `<domain>` in Amazon SES and add its DNS records in Cloudflare; put the SES SMTP URL in `.env`.

## Deploying without building on the server

Build with the prod compose files from a clean copy of the repo (`git archive HEAD`) with the server's `.env` next to it, so the `NEXT_PUBLIC_*` values are the real https ones, then ship each image and restart that service:

```bash
docker compose -p syncschedule -f docker-compose.yml -f docker-compose.prod.yml build
docker save syncschedule-<service> | gzip | ssh -i ~/.ssh/quanttoria-prod.pem ubuntu@184.169.166.191 'gunzip | docker load'
ssh -i ~/.ssh/quanttoria-prod.pem ubuntu@184.169.166.191 'cd ~/app && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build --no-deps <service>'
```

Send the compose files with `git archive HEAD | ssh ... 'cd ~/app && tar -x'` (never rsync over `.env`). Each web image is ~1 GB, so the upload takes a few minutes per app.
Every container has a memory cap in `docker-compose.prod.yml` (`mem_limit` plus `NODE_OPTIONS=--max-old-space-size`); if one restarts on its own, check `docker ps` and raise its cap.
Billing is on (`COMPOSE_PROFILES=billing`, Cashfree sandbox keys); its webhook is `https://accounts.<domain>/api/webhooks/billing/cashfree`.

## Deploying from GitHub Actions

Actions tab, "Deploy", "Run workflow" (`.github/workflows/deploy.yml`). It runs the service tests, builds the arm64 images on a GitHub runner, pushes them to
`ghcr.io/chetdeva/qcalendar-<service>:<git sha>`, opens SSH for the runner's IP in the security group, pulls and restarts the chosen services, checks the site
and closes SSH again (also when the deploy fails). Inputs: `services` (space-separated, default all) and `ref_tag` (a git sha to redeploy = rollback).
Migrations are still run by hand. The Mac steps above still work as a fallback.

One-time setup:
- Repo secrets (Settings, Environments, `production`; add yourself as required reviewer if you want an approval click): `DOMAIN`, `SUPABASE_URL`,
  `SUPABASE_PUBLISHABLE_KEY`, `CF_ANALYTICS_TOKEN`, `SERVER_HOST` (184.169.166.191), `SSH_PRIVATE_KEY` (a new deploy-only key, public half in the server's
  `~/.ssh/authorized_keys`), `SG_ID` (the `quanttoria-web` security group), `AWS_ROLE_ARN`.
- AWS: an IAM OIDC provider for `token.actions.githubusercontent.com`, and a role trusted only for `repo:chetdeva/qcalendar:environment:production`
  whose policy allows `ec2:AuthorizeSecurityGroupIngress` and `ec2:RevokeSecurityGroupIngress` on that one security group.
- GitHub: after the first run make each `qcalendar-*` package public (Packages, Package settings), so the server can pull without logging in.

## Operating it

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=100 calendar-service
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build home-ui   # redeploy one app
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart caddy
```

Everything restarts by itself after a reboot (`restart: unless-stopped`). Run exactly one `calendar-service`. chat-service uses the same database in its own `chat` schema (created on start).
