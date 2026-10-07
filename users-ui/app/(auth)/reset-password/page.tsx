import Link from 'next/link';
import { currentSession } from '@/lib/supabase/server';
import { ResetForm } from './reset-form';

export default async function ResetPasswordPage() {
  const session = await currentSession();
  if (!session) {
    return (
      <div className="card">
        <h1>Link expired</h1>
        <p className="muted">This reset link is invalid or has already been used.</p>
        <Link href="/forgot-password">Request a new link</Link>
      </div>
    );
  }
  return (
    <div className="card">
      <div>
        <h1>Choose a new password</h1>
        <p className="muted">for {session.user.email}</p>
      </div>
      <ResetForm email={session.user.email ?? ''} />
    </div>
  );
}
