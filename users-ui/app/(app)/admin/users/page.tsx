import { getMe } from '@/lib/me';
import { AdminUsers } from './admin-users';

export default async function AdminUsersPage() {
  const result = await getMe();
  if ('error' in result) return null; // /admin's layout already refused anyone who is not an admin
  return (
    <>
      <div>
        <h1>Users</h1>
        <p className="muted">Invite teachers, change roles, and disable accounts.</p>
      </div>
      <AdminUsers meId={result.me.id} />
    </>
  );
}
