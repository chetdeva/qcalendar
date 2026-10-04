import type { Me } from '@/lib/calendar';
import { usersUiUrl } from '@/lib/env';

/**
 * Shown when the person's role was changed after they signed in. The calendar already shows the new view, but the login
 * token still carries the old role, so some actions would be refused until they sign in again.
 */
export function RoleBanner({ me }: { me: Me }) {
  return (
    <div className="stale-banner" role="status">
      <span>Your role was changed to <b>{me.role}</b>. Sign out and sign in again so everything works with the new role.</span>
      <form action={`${usersUiUrl}/auth/signout`} method="post"><button type="submit" className="nav-btn">Sign out</button></form>
    </div>
  );
}
