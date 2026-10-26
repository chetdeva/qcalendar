// NEXT_PUBLIC_* values must be read as literal property accesses so Next inlines them into the browser bundle.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const allowedReturnOrigins = process.env.NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS;
export const calendarUrl = process.env.NEXT_PUBLIC_CALENDAR_URL ?? '';
/** Where signed-in people land by default. The dashboard when it is configured, otherwise their profile. */
export const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? '';
export const landing = dashboardUrl || '/profile';
/** The public website, for the "Back to Website" link on the sign-in pages. */
export const homeUrl = (process.env.NEXT_PUBLIC_HOME_URL ?? 'http://localhost:3004').replace(/\/$/, '');
/** The same WhatsApp contact as the public website (home-ui/content/site.ts). */
export const whatsappLink = `https://wa.me/919119571369?text=${encodeURIComponent("Hi Princy! I'd like to customize a personalized learning plan for my child. My child is in Grade ___.")}`;
export const chatUrl = process.env.NEXT_PUBLIC_CHAT_URL ?? '';
