import { getMe } from '@/lib/me';
import { dashboardUrl } from '@/lib/env';
import { ProfileForm } from './profile-form';
import { Hero } from './_parts/hero';
import { HomeIcon } from './_parts/icons';
import { SideCards } from './_parts/side-cards';
import './profile.css';

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string; updated?: string }> }) {
  const [result, sp] = await Promise.all([getMe(), searchParams]);
  if ('error' in result) return null; // the layout already shows the error
  const { me } = result;
  return (
    <div className="pf">
      <div className="pf-in">
        <nav className="pf-crumbs" aria-label="Breadcrumb">
          <a className="pf-home" href={dashboardUrl || '/profile'}><HomeIcon size={18} /> Dashboard</a>
          <i aria-hidden>/</i><span>Account Settings</span><i aria-hidden>/</i>
          <b aria-current="page">{me.role === 'student' ? 'Student Profile' : 'Teacher Profile'}</b>
        </nav>
        <header>
          <h1>Your profile</h1>
          <p className="pf-lead">We keep this to a minimum: your name, email and time zone for effortless tutoring.</p>
        </header>
        {sp.welcome && <div className="alert alert-ok" role="status">Welcome to SyncSchedule. Your account is ready.</div>}
        {sp.updated === 'password' && <div className="alert alert-ok" role="status">Your password was updated.</div>}
        <Hero me={me} />
        <div className="pf-grid">
          <ProfileForm me={me} />
          <SideCards me={me} />
        </div>
      </div>
    </div>
  );
}
