import Link from 'next/link';
import { redirect } from 'next/navigation';
import { callDashboard } from '@/lib/bff';
import { getMe } from '@/lib/me';
import type { AssignmentDetail } from '@/lib/types';
import { Bar } from '../components/ui';
import { Footer, Header } from '../components/shell';

const GROUPS: { title: string; states: AssignmentDetail['state'][]; empty: string }[] = [
  { title: 'To do', states: ['todo', 'in_progress'], empty: 'Nothing to do right now. New tasks from your teacher show up here.' },
  { title: 'Handed in', states: ['submitted'], empty: 'Nothing waiting for feedback.' },
  { title: 'Graded', states: ['graded'], empty: 'No graded tasks yet.' },
];

/** The student's tasks, grouped by where they are. Open one to work on it or to read the feedback. */
export default async function AssignmentsPage() {
  const result = await getMe();
  if ('error' in result) return <main className="boot-error" role="alert"><h1>Something went wrong</h1><p>{result.error}</p><a href="/assignments">Try again</a></main>;
  const { me } = result;
  if (me.role !== 'student') redirect('/'); // teachers manage tasks from their dashboard
  const { status, json } = await callDashboard<{ assignments?: AssignmentDetail[]; error?: { message?: string } }>('GET', '/v1/assignments');

  return (
    <div className="shell">
      <Header name={me.full_name || me.email} view="student" isAdmin={false} current="assignments" tasks />
      <main>
        <div className="page">
          <div className="sec-head"><div><h1 className="page-title">Assignments &amp; Tasks</h1><p className="sub">Everything your teachers have given you, and how it went.</p></div></div>
          {status !== 200 ? <p className="err" role="alert">{json.error?.message ?? 'Your tasks are unavailable right now.'}</p> : GROUPS.map((g) => {
            const list = (json.assignments ?? []).filter((a) => g.states.includes(a.state));
            return (
              <section key={g.title} aria-labelledby={`g-${g.title}`}>
                <h2 id={`g-${g.title}`} className="col-h">{g.title} <span className="count">{list.length}</span></h2>
                {list.length === 0 ? <p className="empty">{g.empty}</p> : (
                  <ul className="list" aria-label={g.title}>
                    {list.map((a) => (
                      <li key={a.id} className="task">
                        <div className="task-body">
                          <div className="task-title"><h4>{a.title}</h4><span className={`due due-${a.dueTone}`}>{a.due}</span>{a.state === 'graded' && <span className="score score-top">Score: {a.score}/100 ({a.grade})</span>}</div>
                          <p>{a.description}</p>
                          <div className="progress-row"><Bar pct={Math.round((a.doneSteps / a.totalSteps) * 100)} label={`${a.title} progress`} /><small>{a.status}</small></div>
                        </div>
                        <Link className={a.state === 'todo' || a.state === 'in_progress' ? 'btn-primary' : 'btn-soft'} href={`/assignments/${a.id}`}>{a.action}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </main>
      <Footer />
    </div>
  );
}
