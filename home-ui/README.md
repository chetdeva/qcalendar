# home-ui

Marketing homepage for Quanttoria (1:1 online maths for Grades 1–10). Next.js (App Router), plain CSS, no backend: there is no home-service.

Sections: header (logo, nav, Login), hero with a plan form, Why Quanttoria, How it works (steps, US boards, outcomes, who we teach), Meet our founder, parent reviews, footer, floating WhatsApp button.

```bash
cd home-ui && npm install && npm run dev   # http://localhost:3004
npm run test:e2e                           # 10 browser tests (needs Google Chrome)
```

- **Docker:** `docker compose up --build home-ui` (from the repo root) serves it on http://localhost:3004 and also starts users-ui (3003) and users-service (3010), so the Login button works. Stop any `npm run dev` on 3004 first. The Login address is a build arg in `docker-compose.yml` (`NEXT_PUBLIC_ACCOUNTS_URL`); change it and rebuild.
- **Content** comes from the Quanttoria site repo (`chetdeva/quanttoria-8e`: `lib/site.ts` and `components/*`) and lives in `content/site.ts`. It is copied by hand; update both when it changes. Images are copies in `public/images/`.
- **The plan form** has no server. Submitting opens WhatsApp (`wa.me/<number>`) with the details filled in, like the Quanttoria contact form. Nothing is stored.
- **Login** links to users-ui via `NEXT_PUBLIC_ACCOUNTS_URL` (default `http://localhost:3003`; baked in at build time).
- **Reviews** link to the Trustpilot URL set in `content/site.ts` (`site.trustpilotUrl`).
- Not carried over from the Quanttoria site: auth pages, calendar booking, the demo dialog.
