# home-ui

Marketing homepage for the math tutoring site. Next.js (App Router), plain CSS, no backend: there is no home-service.

Sections: header, hero with booking form, Pedagogical Framework, coaches and reviews, Student/Teacher portal panels, trust strip, footer.

```bash
cd home-ui && npm install && npm run dev   # http://localhost:3004
npm run test:e2e                           # 5 browser tests (needs Google Chrome)
```

- **Content is placeholder.** All copy lives in `content/site.ts` (brand, coaches, reviews, ratings, credentials come from the Figma mock and are not real). Replace before launch; the brand is the `BRAND` constant.
- **The booking form does nothing yet.** Submitting only shows a notice; nothing is sent or stored.
- **Photos are gradient/initial stand-ins** (`.photo`, `.coach-photo`); swap in real images under `public/` with `next/image`.
- **Log In / account icon** link to users-ui via `NEXT_PUBLIC_ACCOUNTS_URL` (default `http://localhost:3003`; baked in at build time).
- Not built: the Dual-Cursor Board demo, modals, gamification.
