import { allowedReturnOrigins } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { LoginForm } from '../login-form';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, parseOrigins(allowedReturnOrigins), '/admin');
  return (
    <div className="au-card">
      <div className="au-head">
        <h1>Admin sign in</h1>
        <p>For administrators only. Admin accounts are created by invitation.</p>
      </div>
      <LoginForm next={next} only={{ roles: ['admin'], message: 'This sign-in is for administrators. Use the regular log in page instead.' }} />
    </div>
  );
}
