import { headers } from 'next/headers';
import Link from 'next/link';
import { AppHeader } from '@components/app-header';
import { SiteFooter } from '@components/site-footer';
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
  const onAdmin = me.role === 'admin' && (await headers()).get('x-pathname')?.startsWith('/admin');
  return (
    <div className="app-shell">
      <AppHeader current={onAdmin ? 'dashboard' : 'account'} name={me.full_name || me.email} role={me.role} avatar={me.avatar_updated_at} />
      <div className="app-body">{children}</div>
      <SiteFooter />
    </div>
  );
}
