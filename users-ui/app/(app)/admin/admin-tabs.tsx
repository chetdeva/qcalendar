'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/teachers', label: 'Teachers' },
  { href: '/admin/students', label: 'Students' },
  { href: '/admin/users', label: 'Users & invitations' },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Admin">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'tab tab-on' : 'tab'} aria-current={path.startsWith(t.href) ? 'page' : undefined}>{t.label}</Link>
      ))}
    </nav>
  );
}
