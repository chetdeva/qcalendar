import { callDashboard } from '@/lib/bff';
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

  return (
    <div className="shell">
      <Header name={me.full_name || me.email} role={me.role} avatar={me.avatar_updated_at} view={view} isAdmin={isAdmin} />
      <main>{view === 'teacher' && json.teacher ? <TeacherDashboard initial={json.teacher} /> : json.student ? <StudentDashboard initial={json.student} /> : null}</main>
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
