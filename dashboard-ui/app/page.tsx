import { callBilling, callCalendar, callDashboard } from '@/lib/bff';
import type { TrialState } from '@/lib/types';
import { getMe } from '@/lib/me';
import type { StudentDashboard as StudentData, TeacherDashboard as TeacherData, View } from '@/lib/types';
import { Footer, Header } from './components/shell';
import StudentDashboard from './student-dashboard';
import TeacherDashboard from './teacher-dashboard';

/** One page, two dashboards: the signed-in person's role decides which. Admins can look at either with ?view=. */
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const result = await getMe();
  if ('error' in result) return <Problem message={result.error} />;
  const { me } = result;
  const isAdmin = me.role === 'admin';
  const asked = (await searchParams).view;
  const view: View = isAdmin ? (asked === 'teacher' ? 'teacher' : 'student') : me.role === 'teacher' ? 'teacher' : 'student';

  const { status, json } = await callDashboard<{ student?: StudentData; teacher?: TeacherData; error?: { message?: string } }>('GET', `/v1/dashboard?view=${view}`);
  if (status !== 200) return <Problem message={json.error?.message ?? 'The dashboard is unavailable right now.'} />;

  // Whether the student has a plan, so each mentor's button can say "Request a class" or point to choosing a plan. When billing cannot be
  // reached the answer stays unknown and the button works as usual: the class request is checked again when it is sent.
  let subscribed: boolean | undefined;
  let trial: TrialState | undefined;
  if (view === 'student' && me.role === 'student') {
    const [b, asked] = await Promise.all([
      callBilling<{ subscription?: { status: string } | null; trial?: 'available' | 'booked' | 'done' }>('GET', '/v1/billing/me').catch(() => undefined),
      callCalendar<{ request?: { start: string | null } | null }>('GET', '/v1/trial-requests/mine').catch(() => undefined),
    ]);
    if (b?.status === 200) {
      subscribed = b.json.subscription?.status === 'active';
      const request = asked?.status === 200 ? asked.json.request : null;
      // "available" is the free class not yet scheduled: either nothing asked for, or a request waiting for a teacher.
      trial = b.json.trial === 'done' ? { state: 'taken' } : b.json.trial === 'booked' ? { state: 'booked' } : request ? { state: 'requested', start: request.start } : { state: 'not_taken' };
    }
  }

  return (
    <div className="shell">
      <Header name={me.full_name || me.email} role={me.role} avatar={me.avatar_updated_at} view={view} isAdmin={isAdmin} />
      <main>{view === 'teacher' && json.teacher ? <TeacherDashboard initial={json.teacher} /> : json.student ? <StudentDashboard initial={json.student} subscribed={subscribed} trial={trial} /> : null}</main>
      <Footer />
    </div>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <main className="boot-error" role="alert">
      <h1>Something went wrong</h1>
      <p>{message}</p>
      <a href="/">Try again</a>
    </main>
  );
}
