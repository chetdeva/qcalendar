import Link from 'next/link';
import { ForgotForm } from './forgot-form';

export default function ForgotPasswordPage() {
  return (
    <div className="au-card">
      <div className="au-head">
        <h1>Reset your password</h1>
        <p>Enter your email and we will send you a link.</p>
      </div>
      <ForgotForm />
      <p className="au-switch"><Link href="/login">Back to log in</Link></p>
    </div>
  );
}
