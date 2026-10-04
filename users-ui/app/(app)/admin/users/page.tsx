import Link from 'next/link';
import { getMe } from '@/lib/me';
import { AdminUsers } from './admin-users';

export default async function AdminUsersPage() {
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
      <div>
        <h1>Users</h1>
        <p className="muted">Invite teachers, change roles, and disable accounts.</p>
      </div>
      <AdminUsers meId={result.me.id} />
    </div>
  );
}
