'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ImagePlus, Send } from 'lucide-react';
import type { AssignmentDetail } from '@/lib/types';
import { api } from '../../api-client';
import { Bar } from '../../components/ui';

const MAX_IMAGE = 1_500_000;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const toBase64 = (f: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] ?? ''); r.onerror = () => no(r.error); r.readAsDataURL(f); });

/** Work on one task: tick the steps you have finished, write your answer, attach a picture of your working, hand it in. */
export default function TaskWork({ task }: { task: AssignmentDetail }) {
  const router = useRouter();
  const open = task.state === 'todo' || task.state === 'in_progress';
  const [steps, setSteps] = useState(task.doneSteps);
  const [answer, setAnswer] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function tick(n: number) {
    const next = n === steps ? n - 1 : n; // clicking the last ticked step un-ticks it
    setSteps(next); setError('');
    try { await api(`/api/assignments/${task.id}/progress`, { method: 'POST', body: JSON.stringify({ stepsDone: next }) }); setSaved('Progress saved.'); } catch (e) { setError((e as Error).message); }
  }

  function pick(f: File | undefined) {
    setError('');
    if (!f) return setFile(null);
    if (!TYPES.includes(f.type)) return setError('Please choose a png, jpeg or webp picture.');
    if (f.size > MAX_IMAGE) return setError('Pictures can be up to 1.5 MB.');
    setFile(f);
  }

  async function handIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const attachmentId = file ? (await api<{ id: string }>('/api/attachments', { method: 'POST', body: JSON.stringify({ contentType: file.type, data: await toBase64(file) }) })).id : undefined;
      await api(`/api/assignments/${task.id}/submit`, { method: 'POST', body: JSON.stringify({ answer, attachmentId }) });
      router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <article className="work">
      <header>
        <div className="task-title"><h1 className="page-title">{task.title}</h1><span className={`due due-${task.dueTone}`}>{task.due}</span></div>
        <p className="sub">Assigned by {task.coach}</p>
      </header>
      <p className="prompt">{task.prompt}</p>

      {open ? (
        <form onSubmit={handIn} className="work-form">
          <fieldset>
            <legend>Steps ({steps} of {task.totalSteps} done)</legend>
            <Bar pct={Math.round((steps / task.totalSteps) * 100)} label="Progress" />
            <ol className="steps">{Array.from({ length: task.totalSteps }, (_, i) => i + 1).map((n) => (
              <li key={n}><label><input type="checkbox" checked={n <= steps} onChange={() => tick(n)} /> Step {n}</label></li>
            ))}</ol>
            <small className="note" role="status">{saved}</small>
          </fieldset>
          <label className="fld">Your answer
            <textarea rows={6} required maxLength={5000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Explain how you solved it, step by step." />
          </label>
          <div className="attach">
            <input ref={input} type="file" accept={TYPES.join(',')} hidden aria-label="Picture of your working" onChange={(e) => pick(e.target.files?.[0])} />
            <button type="button" className="btn-soft" onClick={() => input.current?.click()}><ImagePlus size={15} aria-hidden /> {file ? 'Change picture' : 'Add a picture of your working'}</button>
            {file && <span className="file">{file.name}</span>}
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy || !answer.trim()}><Send size={15} aria-hidden /> Hand in</button>
        </form>
      ) : (
        <section className="handed" aria-label="Your work">
          <h2 className="col-h">Your answer</h2>
          <p className="answer">{task.answer}</p>
          {task.attachmentId && <img className="shot" src={`/api/attachments/${task.attachmentId}`} alt="Your picture of your working" />}
          {task.state === 'submitted' && <p className="empty">Handed in. {task.coach} will send feedback here.</p>}
          {task.state === 'graded' && (
            <div className="feedback" aria-label="Feedback">
              <div className="fb-top"><small>{task.gradedLabel}</small><span className="score score-top">Score: {task.score}/100 ({task.grade})</span></div>
              <p className="coach">{task.coach}</p>
              {task.tags.length > 0 && <ul className="tags">{task.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
              {task.note && <blockquote>“{task.note}”</blockquote>}
            </div>
          )}
        </section>
      )}
    </article>
  );
}
