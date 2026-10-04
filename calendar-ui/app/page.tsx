import { getMe, tokenRole } from '@/lib/me';
import StudentHome from './student-home';
import TeacherCalendar from './teacher-calendar';

export default async function Page() {
  const result = await getMe();
  if ('error' in result) {
    return (
      <main className="boot-error" role="alert">
        <h1>Something went wrong</h1>
        <p>{result.error}</p>
        <a href="/">Try again</a>
      </main>
    );
  }
  const { me } = result;
  const stale = (await tokenRole()) !== me.role;
  // Students get "My classes"; teachers get their calendar; admins get every class.
  return me.role === 'student' ? <StudentHome me={me} staleRole={stale} /> : <TeacherCalendar me={me} staleRole={stale} />;
}
