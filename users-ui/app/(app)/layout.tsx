import Link from 'next/link';
import { calendarUrl } from '@/lib/env';
import { getMe } from '@/lib/me';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await getMe();
  if ('error' in result) {
    return (
      <main className="auth-shell">
        <div className="card" role="alert">
          <h1>Something went wrong</h1>
          <p className="muted">{result.error}</p>
          <Link href="/profile">Try again</Link>
        </div>
      </main>
    );
  }
  const { me } = result;
  return (
    <>
      <header className="app-header">
        <div className="brand"><span className="brand-mark" aria-hidden="true">S</span>SyncSchedule</div>
        <nav className="app-nav" aria-label="Main">
          <Link href="/profile">Profile</Link>
          {me.role === 'admin' && <Link href="/admin/users">Users</Link>}
          {calendarUrl && <a href={calendarUrl}>Calendar</a>}
        </nav>
        <div className="who">
          <span>{me.full_name || me.email}</span>
          <span className={`badge badge-${me.role}`}>{me.role}</span>
          <form action="/auth/signout" method="post"><button type="submit" className="btn btn-sm">Sign out</button></form>
        </div>
      </header>
      {children}
    </>
  );
}
