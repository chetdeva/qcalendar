import Image from 'next/image';
import { Bell, Radio, UserRound } from 'lucide-react';
import { calendarUrl, chatUrl, usersUiUrl } from '@/lib/env';
import type { View } from '@/lib/types';
import { Soon } from './ui';

const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

/** Everything an admin can switch between; everyone else just sees their own role. */
function RoleSwitch({ view, isAdmin }: { view: View; isAdmin: boolean }) {
  if (!isAdmin) return <span className="role-chip">{view === 'student' ? 'Student' : 'Teacher'}</span>;
  return (
    <nav className="role-switch" aria-label="Dashboard view">
      <a href="/?view=student" aria-current={view === 'student' ? 'page' : undefined}>Student</a>
      <a href="/?view=teacher" aria-current={view === 'teacher' ? 'page' : undefined}>Teacher</a>
    </nav>
  );
}

export function Header({ name, view, isAdmin }: { name: string; view: View; isAdmin: boolean }) {
  return (
    <header className="site-top">
      <div className="top-in">
        <a className="brand" href="/" aria-label="Quanttoria dashboard">
          <Image src="/images/quanttoria-mark.png" alt="" width={32} height={30} priority />
          <b>Quanttoria</b>
        </a>
        <RoleSwitch view={view} isAdmin={isAdmin} />
        <nav className="tabs" aria-label="Main">
          <a href="/" aria-current="page">Dashboard</a>
          <a href={calendarUrl}>Schedule &amp; Classes</a>
          <Soon className="tab" label="Assignments & Tasks">Assignments &amp; Tasks <small>Soon</small></Soon>
          <Soon className="tab" label="Whiteboard & AI Practice">Whiteboard &amp; AI Practice <small>Soon</small></Soon>
          <a href={chatUrl}>Messages</a>
        </nav>
        <Soon className="launch" label="Launch Live Classroom"><Radio size={18} aria-hidden /> Launch Live Classroom</Soon>
        <Soon className="bell" label="Notifications"><Bell size={18} aria-hidden /></Soon>
        <details className="me">
          <summary>
            <span className="avatar tone-sky" aria-hidden>{initials(name) === '?' ? <UserRound size={16} /> : initials(name)}</span>
            <span className="me-name">{name}</span>
          </summary>
          <div className="me-menu">
            <a href={`${usersUiUrl}/profile`}>Account</a>
            <form action={`${usersUiUrl}/auth/signout`} method="post"><button type="submit">Sign out</button></form>
          </div>
        </details>
      </div>
    </header>
  );
}

export function PreviewNote() {
  return <p className="preview" role="note">Preview: this dashboard shows sample data. Your real classes, tasks and grades arrive in the next release.</p>;
}

export function Footer() {
  return (
    <footer className="foot">
      <p><span aria-hidden>✔</span> Quanttoria Safe Learning Cloud • Compliant K-10 Environment</p>
      <nav aria-label="Footer">
        <span title="Coming soon">Student Code of Conduct</span>
        <span title="Coming soon">Parent Safety Portal</span>
        <span title="Coming soon">Help Center</span>
        <small>© {new Date().getFullYear()} Quanttoria Inc.</small>
      </nav>
    </footer>
  );
}
