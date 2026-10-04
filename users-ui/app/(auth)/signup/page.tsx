import Link from 'next/link';
import { allowedReturnOrigins } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { SignupForm } from './signup-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, parseOrigins(allowedReturnOrigins));
  return (
    <div className="card">
      <div>
        <h1>Create your account</h1>
        <p className="muted">Sign up as a student. Teachers join by invitation.</p>
      </div>
      <SignupForm next={next} />
      <div className="links"><span>Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></span></div>
    </div>
  );
}
