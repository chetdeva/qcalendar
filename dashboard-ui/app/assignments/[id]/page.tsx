import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { callDashboard } from '@/lib/bff';
import { getMe } from '@/lib/me';
import type { AssignmentDetail } from '@/lib/types';
import { Footer, Header } from '../../components/shell';
import TaskWork from './task-work';

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const result = await getMe();
  if ('error' in result) return <main className="boot-error" role="alert"><h1>Something went wrong</h1><p>{result.error}</p></main>;
  const { me } = result;
  if (me.role !== 'student') redirect('/');
  const { status, json } = await callDashboard<AssignmentDetail>('GET', `/v1/assignments/${encodeURIComponent((await params).id)}`);
  if (status === 404) notFound();
  return (
    <div className="shell">
      <Header name={me.full_name || me.email} role={me.role} avatar={me.avatar_updated_at} view="student" isAdmin={false} current="assignments" />
      <main>
        <div className="page narrow">
          <p><Link className="link-end back" href="/assignments">← All tasks</Link></p>
          {status !== 200 ? <p className="err" role="alert">This task is unavailable right now.</p> : <TaskWork task={json} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}
