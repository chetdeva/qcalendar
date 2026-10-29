import Link from 'next/link';
import { allowedReturnOrigins, landing } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, parseOrigins(allowedReturnOrigins), landing);
  const notice = sp.error === 'link' ? 'That link is invalid or has expired. Log in, or request a new one.' : undefined;
  return (
    <div className="au-card">
      <div className="au-head">
        <h1>Welcome back</h1>
        <p>Log in to pick up where you left off.</p>
      </div>
      <LoginForm next={next} notice={notice} />
      <p className="au-switch">New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
    </div>
  );
}
