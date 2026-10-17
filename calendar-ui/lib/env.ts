// NEXT_PUBLIC_* values must be read as literal property accesses so Next inlines them into the browser bundle.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
/** Where people log in, manage their account and sign out (the users-ui app). */
export const usersUiUrl = (process.env.NEXT_PUBLIC_USERS_UI_URL ?? 'http://localhost:3003').replace(/\/$/, '');
/** The chat app, linked from the header menu. */
export const chatUrl = (process.env.NEXT_PUBLIC_CHAT_URL ?? 'http://localhost:3005').replace(/\/$/, '');
/** The dashboard, linked from the header menu. */
export const dashboardUrl = (process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3006').replace(/\/$/, '');
