import type { ReactNode } from 'react';
import mark from './quanttoria-mark.png';
import { calendarUrl, chatUrl, dashboardUrl, usersUiUrl } from './links';
import './header.css';

export type HeaderTab = 'dashboard' | 'calendar' | 'assignments' | 'chat' | 'account';

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
const label = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

/**
 * The one Quanttoria header: logo, role chip, tabs and the avatar menu. Every app renders this and passes
 * who is signed in and which tab it is. `left` replaces the role chip (the dashboard's admin switch),
 * `right` sits before the avatar (dashboard extras), `menu` adds links to the avatar menu.
 */
export function AppHeader({ current, name, role, left, right, menu }: {
  current: HeaderTab; name: string; role: string; left?: ReactNode; right?: ReactNode; menu?: ReactNode;
}) {
  const tab = (id: HeaderTab) => (id === current ? 'page' : undefined);
  return (
    <header className="qh">
      <div className="qh-in">
        <a className="qh-brand" href={dashboardUrl} aria-label="Quanttoria dashboard">
          <img src={mark.src} alt="" width={32} height={30} />
          <b>Quanttoria</b>
        </a>
        {left ?? <span className="qh-role">{label(role)}</span>}
        <nav className="qh-tabs" aria-label="Main">
          <a href={dashboardUrl} aria-current={tab('dashboard')}>Dashboard</a>
          <a href={calendarUrl} aria-current={tab('calendar')}>Calendar</a>
          {role === 'student'
            ? <a href={`${dashboardUrl}/assignments`} aria-current={tab('assignments')}>Assignments</a>
            : <button type="button" className="qh-soon" disabled title="Coming soon" aria-label="Assignments (coming soon)">Assignments <small>Soon</small></button>}
          <a href={chatUrl} aria-current={tab('chat')}>Chat</a>
        </nav>
        {right}
        <details className="qh-me">
          <summary>
            <span className="qh-avatar" aria-hidden>{initials(name)}</span>
            <span className="qh-name">{name}</span>
          </summary>
          <div className="qh-menu">
            <a href={`${usersUiUrl}/profile`} aria-current={tab('account')}>Account</a>
            {menu}
            <form action={`${usersUiUrl}/auth/signout`} method="post"><button type="submit">Sign out</button></form>
          </div>
        </details>
      </div>
    </header>
  );
}
