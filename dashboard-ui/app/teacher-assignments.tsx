'use client';

import { useRef, useState } from 'react';
import { ClipboardCheck, Coins, LineChart, Mic, Rocket, Send } from 'lucide-react';
import type { Submission, TeacherDashboard as Data } from '@/lib/types';
import { api } from './api-client';
import { Attachment, Avatar, Soon } from './components/ui';

const XP_FOR_PRESET: Record<string, number> = { '5-Question Micro-Quest': 60, 'Spatial Proof Scratchpad': 120, 'Olympiad Drill': 200 };

/** The teacher's Assignments screen: send a task, then grade what comes back. */
export default function TeacherAssignments({ initial, student }: { initial: Data; student?: string }) {
  const [d, setD] = useState(initial);
  const [toast, setToast] = useState('');
  const [studentId, setStudentId] = useState(initial.builder.students.some((s) => s.id === student) ? student! : initial.builder.defaults.studentId);
  const builder = useRef<HTMLElement>(null);

  const refresh = async () => setD((await api<{ teacher: Data }>('/api/dashboard?view=teacher')).teacher);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000); };

  return (
    <div className="page">
      <div className="sec-head"><div><h1 className="page-title">Assignments &amp; Tasks</h1><p className="sub">Send a task to a student, then grade what they hand in.</p></div></div>
      <TaskBuilder d={d} studentId={studentId} setStudentId={setStudentId} say={say} refSection={builder} />
      <Grading d={d} refresh={refresh} say={say} />
      <p className="toast" role="status" aria-live="polite">{toast}</p>
    </div>
  );
}

function TaskBuilder({ d, studentId, setStudentId, say, refSection }: { d: Data; studentId: string; setStudentId: (id: string) => void; say: (m: string) => void; refSection: React.RefObject<HTMLElement | null> }) {
  const df = d.builder.defaults;
  const [preset, setPreset] = useState('');
  const [concept, setConcept] = useState(df.concept);
  const [dueDate, setDueDate] = useState(df.dueDate);
  const [xp, setXp] = useState(df.xp);
  const [prompt, setPrompt] = useState(df.prompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const student = d.builder.students.find((s) => s.id === studentId);
  const noStudents = d.builder.students.length === 0;

  async function dispatch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/assignments', { method: 'POST', body: JSON.stringify({ studentId, preset: preset || undefined, concept, dueDate, xp, prompt }) });
      say(`Assignment sent to ${student?.name ?? 'the student'}.`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <section ref={refSection} id="task-builder" aria-labelledby="builder-h">
      <div className="sec-head"><Rocket size={20} aria-hidden /><h2 id="builder-h">Assign Task / Quest</h2><span className="tag tag-sun date">Quick Dispatch</span></div>
      <form className="builder" onSubmit={dispatch}>
        {noStudents && <p className="empty">Students appear here once you have a class with them. Schedule one in the calendar first.</p>}
        <fieldset>
          <legend>Learning presets</legend>
          <div className="presets">{d.builder.presets.map((p) => <button key={p} type="button" className="fchip" aria-pressed={preset === p} onClick={() => { setPreset(p); setXp(XP_FOR_PRESET[p] ?? xp); }}>{p}</button>)}</div>
        </fieldset>
        <label className="fld">Target Student or Cohort
          <select value={studentId} required disabled={noStudents} onChange={(e) => setStudentId(e.target.value)}>{d.builder.students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade} • {s.track})</option>)}</select>
        </label>
        <label className="fld">Interactive Concept &amp; Tool
          <select value={concept} onChange={(e) => setConcept(e.target.value)}>{d.builder.tools.map((t) => <option key={t}>{t}</option>)}</select>
        </label>
        <div className="two">
          <label className="fld">Due Date<input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <label className="fld">XP Reward<span className="xp"><Coins size={15} aria-hidden /><input type="number" min={0} max={1000} step={10} required value={xp} onChange={(e) => setXp(Number(e.target.value))} aria-label="XP reward" /> XP</span></label>
        </div>
        <label className="fld">Coach’s Prompt to Student
          <textarea rows={3} required maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn-primary btn-block" disabled={busy || noStudents}><Send size={15} aria-hidden /> Dispatch Assignment &amp; Notify Student <span aria-hidden>🚀</span></button>
      </form>
    </section>
  );
}

function Grading({ d, refresh, say }: { d: Data; refresh: () => Promise<void>; say: (m: string) => void }) {
  const queue = d.grading.queue;
  const [currentId, setCurrentId] = useState<string | null>(null);
  const current: Submission | undefined = queue.find((s) => s.id === currentId) ?? queue[0];
  const others = queue.filter((s) => s.id !== current?.id);

  return (
    <section aria-labelledby="grading-h">
      <div className="sec-head"><ClipboardCheck size={20} aria-hidden /><h2 id="grading-h">Grading Queue &amp; Resilience Feedback</h2><span className="tag tag-sky date">{d.grading.readyForSync}</span></div>
      {current ? <GradeCard key={current.id} s={current} tags={d.grading.availableTags} refresh={async () => { setCurrentId(null); await refresh(); }} say={say} /> : <p className="empty">The grading queue is clear. Nice work!</p>}
      <ul className="rows">
        {others.map((s) => (
          <li key={s.id} className="queue-row">
            <Avatar name={s.student} initials={s.initials} size={44} />
            <div className="grow"><h3>{s.student} <span className="tag tag-rose">Awaiting Coach Grading</span></h3><p>{s.task}</p></div>
            <small>{s.submitted}</small>
            <button type="button" className="btn-pill" onClick={() => setCurrentId(s.id)} aria-label={`Begin review of ${s.student}`}><ClipboardCheck size={13} aria-hidden /> Begin Review</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GradeCard({ s, tags, refresh, say }: { s: Submission; tags: string[]; refresh: () => Promise<void>; say: (m: string) => void }) {
  const [score, setScore] = useState<string>(s.score === null ? '' : String(s.score));
  const [picked, setPicked] = useState<string[]>(s.tags);
  const [note, setNote] = useState(s.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = score !== '' && Number.isInteger(Number(score)) && Number(score) >= 0 && Number(score) <= 100;
  const body = () => JSON.stringify({ score: Number(score), tags: picked, note });
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  async function send(action: 'publish' | 'draft') {
    setBusy(true); setError('');
    try {
      const res = await api<{ parentSync?: 'sent' | 'no_guardian' | 'failed' }>(`/api/submissions/${s.id}/${action}`, { method: 'POST', body: body() });
      if (action === 'draft') return say('Draft saved.');
      const mail = res.parentSync === 'sent' ? 'Their parent has been emailed.' : res.parentSync === 'no_guardian' ? 'No parent email is on file, so no email was sent.' : 'The parent email could not be queued.';
      say(`Grade published for ${s.student}. ${mail}`);
      await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <article className="grade-card" aria-label={`Grade ${s.student}`}>
      <div className="g-left">
        <div className="g-head"><Avatar name={s.student} initials={s.initials} size={36} /><div className="grow"><h3>{s.student}</h3><small>Task: {s.task}</small></div><span className="tag tag-sky">{s.submitted}</span></div>
        <div className="scratch">
          <span className="tag tag-white">Student’s answer</span>
          <p className="answer">{s.answer}</p>
          {s.attachmentId && <Attachment id={s.attachmentId} type={s.attachmentType} alt={`${s.student}’s picture of their working`} />}
        </div>
      </div>
      <div className="g-right">
        <div className="score-row"><b>Assessment Score</b><label className="score-box"><input type="number" min={0} max={100} step={1} value={score} placeholder="—" onChange={(e) => setScore(e.target.value)} aria-label="Assessment score" /> / 100</label></div>
        <small className="lab">Praise &amp; Rubric Tags</small>
        <div className="presets">{tags.map((t) => <button key={t} type="button" className="fchip" aria-pressed={picked.includes(t)} onClick={() => toggle(t)}>{t}</button>)}</div>
        <div className="note-row"><small className="lab">Encouragement Note to Student &amp; Parent</small><Soon className="rec"><Mic size={12} aria-hidden /> Record 30s Audio</Soon></div>
        <textarea rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Encouragement note" placeholder="What did they do well? What should they try next?" />
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions row">
          <button type="button" className="btn-primary grow" disabled={busy || !valid} onClick={() => send('publish')}><LineChart size={15} aria-hidden /> Publish Grade &amp; Send Parent Sync</button>
          <button type="button" className="btn-white" disabled={busy || !valid} onClick={() => send('draft')}>Draft</button>
        </div>
      </div>
    </article>
  );
}
