// NEXT_PUBLIC_* values must be read as literal property accesses so Next inlines them into the browser bundle.
const trim = (u: string) => u.replace(/\/$/, '');
/** Where people log in, manage their account and sign out (the users-ui app). */
export const usersUiUrl = trim(process.env.NEXT_PUBLIC_USERS_UI_URL ?? 'http://localhost:3003');
export const calendarUrl = trim(process.env.NEXT_PUBLIC_CALENDAR_URL ?? 'http://localhost:3002');
export const chatUrl = trim(process.env.NEXT_PUBLIC_CHAT_URL ?? 'http://localhost:3005');
export const dashboardUrl = trim(process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3006');
