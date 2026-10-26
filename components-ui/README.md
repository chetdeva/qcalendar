# components-ui

UI shared by the Next.js apps (users-ui, calendar-ui, chat-ui, dashboard-ui). Today that is the header.

```tsx
import { AppHeader } from '@components/app-header';
<AppHeader current="chat" name={me.full_name || me.email} role={me.role} />
```

`current` highlights a tab (`dashboard`, `calendar`, `assignments`, `chat`; `account` highlights none). Optional slots: `left` (replaces the role chip), `right` (before the avatar), `menu` (extra avatar-menu links).

## Wiring an app up
- `tsconfig.json`: `paths` maps `@components/*` to `../components-ui/*`, plus `react` and `react/jsx-runtime` to the app's own `@types/react`; `include` has `../components-ui`.
- `next.config.ts`: `turbopack.root` is the repo root and `resolveAlias` points `react` at the app's copy.
- Load Plus Jakarta Sans in the root layout as `--font-jakarta` (the header's font).
- Set the four `NEXT_PUBLIC_{USERS_UI,CALENDAR,CHAT,DASHBOARD}_URL` build args (`links.ts` reads them); each app needs its own URL too, so the tab for the current app points at itself.
- Docker: `docker/next.Dockerfile` copies this folder to `../components-ui` of the app.

## Rules
- No package imports except `react`: this folder cannot see an app's `node_modules` (hence `<img>` and inline initials, not `next/image` or lucide).
- Every CSS class is prefixed `qh-` and colours live on `.qh`, so it cannot clash with an app's styles.

## Dev note
Turbopack's cache does not notice edits made outside an app's folder. After changing a file here, if a dev server keeps reloading the page or shows old styles, delete that app's `.next` folder (the e2e configs already start from a clean `.next-e2e`).
