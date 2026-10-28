import { Bell } from 'lucide-react';
import { AppHeader } from '@components/app-header';
import { StudentNudge } from '@components/student-nudge';
import { SiteFooter } from '@components/site-footer';
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

export function Header({ name, role, view, isAdmin, current = 'dashboard', avatar }: { name: string; role: string; view: View; isAdmin: boolean; current?: 'dashboard' | 'assignments'; avatar?: string | null }) {
  return (
    <AppHeader
      current={current}
      assignmentsHref={isAdmin ? `/assignments?view=${view}` : undefined}
      name={name}
      avatar={avatar}
      role={role}
      left={isAdmin ? <RoleSwitch view={view} /> : undefined}
      afterBrand={role === 'student' && current === 'dashboard' ? <StudentNudge /> : undefined}
      right={<Soon className="bell" label="Notifications"><Bell size={18} aria-hidden /></Soon>}
    />
  );
}

export const Footer = SiteFooter; // the shared site footer, as on every other screen
