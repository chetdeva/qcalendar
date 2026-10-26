import { Bell } from 'lucide-react';
import { AppHeader } from '@components/app-header';
import type { View } from '@/lib/types';
import { Soon } from './ui';

/** The admin's Student/Teacher switch; everyone else just sees their role chip. */
function RoleSwitch({ view }: { view: View }) {
  return (
    <nav className="role-switch" aria-label="Dashboard view">
      <a href="/?view=student" aria-current={view === 'student' ? 'page' : undefined}>Student</a>
      <a href="/?view=teacher" aria-current={view === 'teacher' ? 'page' : undefined}>Teacher</a>
    </nav>
  );
}

export function Header({ name, role, view, isAdmin, current = 'dashboard' }: { name: string; role: string; view: View; isAdmin: boolean; current?: 'dashboard' | 'assignments' }) {
  return (
    <AppHeader
      current={current}
      name={name}
      role={role}
      left={isAdmin ? <RoleSwitch view={view} /> : undefined}
      right={<Soon className="bell" label="Notifications"><Bell size={18} aria-hidden /></Soon>}
    />
  );
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
