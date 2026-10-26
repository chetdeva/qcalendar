// NEXT_PUBLIC_* values must be read as literal property accesses so Next inlines them into the browser bundle.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
/** Where people log in, manage their account and sign out (the users-ui app). */
export const usersUiUrl = (process.env.NEXT_PUBLIC_USERS_UI_URL ?? 'http://localhost:3003').replace(/\/$/, '');
/** Sibling apps the dashboard links to. */
export const calendarUrl = (process.env.NEXT_PUBLIC_CALENDAR_URL ?? 'http://localhost:3002').replace(/\/$/, '');
export const chatUrl = (process.env.NEXT_PUBLIC_CHAT_URL ?? 'http://localhost:3005').replace(/\/$/, '');
