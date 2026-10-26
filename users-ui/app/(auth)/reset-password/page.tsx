import Link from 'next/link';
import { currentSession } from '@/lib/supabase/server';
import { ResetForm } from './reset-form';

export default async function ResetPasswordPage() {
  const session = await currentSession();
  if (!session) {
    return (
      <div className="au-card">
        <div className="au-head">
          <h1>Link expired</h1>
          <p>This reset link is invalid or has already been used.</p>
        </div>
        <p className="au-switch"><Link href="/forgot-password">Request a new link</Link></p>
      </div>
    );
  }
  return (
    <div className="au-card">
      <div className="au-head">
        <h1>Choose a new password</h1>
        <p>for {session.user.email}</p>
      </div>
      <ResetForm email={session.user.email ?? ''} />
    </div>
  );
}
