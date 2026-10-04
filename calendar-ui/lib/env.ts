// NEXT_PUBLIC_* values must be read as literal property accesses so Next inlines them into the browser bundle.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
/** Where people log in, manage their account and sign out (the users-ui app). */
export const usersUiUrl = (process.env.NEXT_PUBLIC_USERS_UI_URL ?? 'http://localhost:3003').replace(/\/$/, '');
