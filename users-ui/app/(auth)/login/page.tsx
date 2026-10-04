import Link from 'next/link';
import { allowedReturnOrigins } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, parseOrigins(allowedReturnOrigins));
  const notice = sp.error === 'link' ? 'That link is invalid or has expired. Log in, or request a new one.' : undefined;
  return (
    <div className="card">
      <div>
        <h1>Log in</h1>
        <p className="muted">Welcome back.</p>
      </div>
      <LoginForm next={next} notice={notice} />
      <div className="links">
        <Link href="/forgot-password">Forgot password?</Link>
        <span>New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></span>
      </div>
    </div>
  );
}
