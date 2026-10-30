import Link from 'next/link';
import { getMe } from '@/lib/me';
import { AdminTabs } from './admin-tabs';

/** Everything under /admin is for admins: others see "No access". The tabs are shared by every admin page. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await getMe();
  if ('error' in result) return null;
  if (result.me.role !== 'admin') {
    return (
      <div className="page">
        <div className="panel" role="alert">
          <h1>No access</h1>
          <p className="muted">This page is for admins only.</p>
          <Link href="/profile">Back to your profile</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      <AdminTabs />
      {children}
    </div>
  );
}
