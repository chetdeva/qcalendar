import { getMe } from '@/lib/me';
import { ProfileForm } from './profile-form';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string; updated?: string }> }) {
  const [result, sp] = await Promise.all([getMe(), searchParams]);
  if ('error' in result) return null; // the layout already shows the error
  const { me } = result;
  const timezones = Intl.supportedValuesOf('timeZone');
  return (
    <div className="page">
      <div>
        <h1>Your profile</h1>
        <p className="muted">We keep this to a minimum: your name, email and a time zone.</p>
      </div>
      {sp.welcome && <div className="alert alert-ok" role="status">Welcome to SyncSchedule. Your account is ready.</div>}
      {sp.updated === 'password' && <div className="alert alert-ok" role="status">Your password was updated.</div>}
      <ProfileForm me={me} timezones={timezones} />
    </div>
  );
}
