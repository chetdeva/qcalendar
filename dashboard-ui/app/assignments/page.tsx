import { callDashboard } from '@/lib/bff';
import { getMe } from '@/lib/me';
import type { StudentDashboard as StudentData, TeacherDashboard as TeacherData, View } from '@/lib/types';
import { Footer, Header } from '../components/shell';
import StudentAssignments from '../student-assignments';
import TeacherAssignments from '../teacher-assignments';

/** Students: their tasks and feedback. Teachers: assign and grade. The role decides. */
export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ view?: string; student?: string }> }) {
  const result = await getMe();
  if ('error' in result) return <main className="boot-error" role="alert"><h1>Something went wrong</h1><p>{result.error}</p><a href="/assignments">Try again</a></main>;
  const { me } = result;
  const isAdmin = me.role === 'admin';
  const sp = await searchParams;
  const view: View = isAdmin ? (sp.view === 'teacher' ? 'teacher' : 'student') : me.role === 'teacher' ? 'teacher' : 'student';
  const name = me.full_name || me.email;

  if (view === 'teacher') {
    const t = await callDashboard<{ teacher?: TeacherData; error?: { message?: string } }>('GET', '/v1/dashboard?view=teacher');
    return (
      <div className="shell">
        <Header name={name} role={me.role} view="teacher" isAdmin={isAdmin} current="assignments" />
        <main>{t.status === 200 && t.json.teacher ? <TeacherAssignments initial={t.json.teacher} student={sp.student} /> : <p className="err" role="alert">{t.json.error?.message ?? 'Your tasks are unavailable right now.'}</p>}</main>
        <Footer />
      </div>
    );
  }
  const { status, json } = await callDashboard<{ student?: StudentData; error?: { message?: string } }>('GET', '/v1/dashboard?view=student');

  return (
    <div className="shell">
      <Header name={name} role={me.role} view="student" isAdmin={isAdmin} current="assignments" />
      <main>{status === 200 && json.student ? <StudentAssignments d={json.student} /> : <p className="err" role="alert">{json.error?.message ?? 'Your tasks are unavailable right now.'}</p>}</main>
      <Footer />
    </div>
  );
}
