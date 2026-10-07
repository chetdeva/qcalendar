import Link from 'next/link';
import { ForgotForm } from './forgot-form';

export default function ForgotPasswordPage() {
  return (
    <div className="card">
      <div>
        <h1>Reset your password</h1>
        <p className="muted">Enter your email and we will send you a link.</p>
      </div>
      <ForgotForm />
      <div className="links"><Link href="/login">Back to log in</Link></div>
    </div>
  );
}
