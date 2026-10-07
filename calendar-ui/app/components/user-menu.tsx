import type { Me } from '@/lib/calendar';
import { usersUiUrl } from '@/lib/env';

/** Who is signed in, a link to their account page, and sign-out. Both live in users-ui, which owns the login. */
export function UserMenu({ me }: { me: Me }) {
  return (
    <div className="who">
      <span className="who-name">{me.full_name || me.email}</span>
      <span className={`badge badge-${me.role}`}>{me.role}</span>
      <a className="nav-btn as-link" href={`${usersUiUrl}/profile`}>Account</a>
      <form action={`${usersUiUrl}/auth/signout`} method="post">
        <button type="submit" className="nav-btn">Sign out</button>
      </form>
    </div>
  );
}
