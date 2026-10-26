import Link from 'next/link';
import { AppHeader } from '@components/app-header';
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
      <AppHeader current="account" name={me.full_name || me.email} role={me.role} menu={me.role === 'admin' ? <Link href="/admin/users">Users</Link> : undefined} />
      {children}
    </>
  );
}
