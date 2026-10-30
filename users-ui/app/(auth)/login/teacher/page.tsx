import { allowedReturnOrigins, landing } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { LoginForm } from '../login-form';

export default async function TeacherLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, parseOrigins(allowedReturnOrigins), landing);
  return (
    <div className="au-card">
      <div className="au-head">
        <h1>Teacher sign in</h1>
        <p>For teachers. Teacher accounts are created by invitation from an administrator.</p>
      </div>
      <LoginForm next={next} only={{ roles: ['teacher', 'admin'], message: 'This sign-in is for teachers. Students, use the regular log in page.' }} />
    </div>
  );
}
