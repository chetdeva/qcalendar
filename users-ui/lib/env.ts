// NEXT_PUBLIC_* values must be read as literal property accesses so Next inlines them into the browser bundle.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const allowedReturnOrigins = process.env.NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS;
export const calendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL ?? '';
