import Link from 'next/link';
import { allowedReturnOrigins, landing } from '@/lib/env';
import { parseOrigins, safeNext } from '@/lib/return-to';
import { SignupForm } from './signup-form';

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next, parseOrigins(allowedReturnOrigins), landing);
  return (
    <div className="au-card">
      <div className="au-head">
        <h1>Create your account <span aria-hidden>🚀</span></h1>
        <p>Sign up as a student. Teachers join by invitation.</p>
      </div>
      <SignupForm next={next} />
      <p className="au-switch">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></p>
    </div>
  );
}
