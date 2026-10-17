'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarClock, ClipboardCheck, Coins, Eye, IdCard, LineChart, Mic, MessageSquare, PenLine, Rocket, Search, Send, Users, Video, Wand2, DoorOpen, Maximize2, ShieldCheck } from 'lucide-react';
import type { DirectoryStudent, Submission, TeacherDashboard as Data, TeacherSession } from '@/lib/types';
import { chatUrl } from '@/lib/env';
import { api } from './api-client';
import { Avatar, Bar, Soon } from './components/ui';

const XP_FOR_PRESET: Record<string, number> = { '5-Question Micro-Quest': 60, 'Spatial Proof Scratchpad': 120, 'Olympiad Drill': 200 };

export default function TeacherDashboard({ initial }: { initial: Data }) {
  const [d, setD] = useState(initial);
  const [toast, setToast] = useState('');
  const [studentId, setStudentId] = useState(initial.builder.defaults.studentId);
  const builder = useRef<HTMLElement>(null);

  const refresh = async () => setD((await api<{ teacher: Data }>('/api/dashboard?view=teacher')).teacher);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000); };

  function assignTo(id: string) {
    setStudentId(id);
    builder.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    builder.current?.querySelector('textarea')?.focus({ preventScroll: true });
  }

  return (
    <div className="page">
      <WelcomeBar d={d} onNew={() => assignTo(studentId)} />
      <div className="split7">
        <Schedule d={d} />
        <TaskBuilder d={d} studentId={studentId} setStudentId={setStudentId} say={say} refSection={builder} />
      </div>
      <Grading d={d} refresh={refresh} say={say} />
      <Directory d={d} onAssign={assignTo} />
      <p className="toast" role="status" aria-live="polite">{toast}</p>
    </div>
  );
}

function WelcomeBar({ d, onNew }: { d: Data; onNew: () => void }) {
  return (
    <section className="hero hero-teacher" aria-label="Welcome">
      <div className="welcome-row">
        <Avatar name={d.profile.name} initials={d.profile.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()} photo="/images/princy.jpg" size={72} />
        <div className="grow">
          <p className="eyebrow-row"><span className="tag tag-sky">{d.profile.title}</span><span className="tag tag-sun"><i className="dot" /> {d.profile.status}</span></p>
          <h1>Welcome, {d.welcome.name}! <span aria-hidden>🍎</span></h1>
          <p className="blurb">{d.welcome.blurb}</p>
        </div>
        <div className="fast">
          <Soon className="btn-primary"><PenLine size={15} aria-hidden /> Instant Whiteboard</Soon>
          <button type="button" className="btn-white" onClick={onNew}><ClipboardCheck size={15} aria-hidden /> New Quest / Task</button>
          <a className="round" href={chatUrl} aria-label="Open messages"><MessageSquare size={16} aria-hidden /></a>
        </div>
      </div>
      <ul className="ribbon">
        {d.metrics.map((m) => <li key={m.label} className={`metric tone-${m.tone}`}><small>{m.label}</small><b>{m.value}</b><span>{m.note}</span></li>)}
      </ul>
    </section>
  );
}

function Schedule({ d }: { d: Data }) {
  const [hero, ...rest] = d.schedule.sessions;
  return (
    <section aria-labelledby="sched-h">
      <div className="sec-head"><Video size={20} aria-hidden /><h2 id="sched-h">Today’s Teaching Schedule</h2><span className="tag tag-sky date">{d.schedule.dateLabel}</span></div>
      {hero && <HeroSession s={hero} />}
      <ul className="rows">{rest.map((s) => <SessionRow key={s.id} s={s} />)}</ul>
      <p className="office"><CalendarClock size={15} aria-hidden /> {d.schedule.officeHours.label} <small>{d.schedule.officeHours.rsvps} RSVPs</small></p>
    </section>
  );
}

function HeroSession({ s }: { s: TeacherSession }) {
  return (
    <article className="session-hero" aria-label={`${s.student}, ${s.time}`}>
      <div className="sh-top"><span className="live"><i />{s.startsIn}</span><small>{s.time}</small><span className="tag tag-sun">{s.kind}</span></div>
      <div className="who-row top"><Avatar name={s.student} initials={s.initials} size={52} /><div className="grow"><h3>{s.student}</h3><small>{s.grade} • {s.detail}</small></div>{s.tools?.map((t) => <span key={t} className="kit"><Wand2 size={13} aria-hidden /> {t}</span>)}</div>
      <p className="topic-row"><small>Topic:</small> <b>{s.topic}</b></p>
      {s.parentNote && <p className="parent-note">{s.parentNote}</p>}
      <div className="actions row">
        <Soon className="btn-primary"><DoorOpen size={15} aria-hidden /> Enter Classroom Now</Soon>
        <Soon className="btn-soft"><BookOpen size={15} aria-hidden /> Lesson Plan &amp; Sandbox</Soon>
        <Soon className="btn-quiet"><IdCard size={15} aria-hidden /> Profile</Soon>
      </div>
    </article>
  );
}

function SessionRow({ s }: { s: TeacherSession }) {
  return (
    <li className="session-row" aria-label={`${s.student}, ${s.time}`}>
      <Avatar name={s.student} initials={s.initials} size={44} />
      <div className="grow"><h3>{s.student} <small>• {s.grade}</small></h3><p>{s.detail}</p></div>
      <div className="when"><b>{s.time}</b><small>{s.startsIn}</small></div>
      <Soon className="btn-pill"><Eye size={13} aria-hidden /> Preview</Soon>
    </li>
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
        <fieldset>
          <legend>Learning presets</legend>
          <div className="presets">{d.builder.presets.map((p) => <button key={p} type="button" className="fchip" aria-pressed={preset === p} onClick={() => { setPreset(p); setXp(XP_FOR_PRESET[p] ?? xp); }}>{p}</button>)}</div>
        </fieldset>
        <label className="fld">Target Student or Cohort
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>{d.builder.students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.grade} • {s.track})</option>)}</select>
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
        <button type="submit" className="btn-primary btn-block" disabled={busy}><Send size={15} aria-hidden /> Dispatch Assignment &amp; Notify Student <span aria-hidden>🚀</span></button>
      </form>
    </section>
  );
}

const WITH_SCRATCHPAD_HINT = 'No scratchpad was attached to this submission.';

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
  const [score, setScore] = useState(s.score);
  const [picked, setPicked] = useState<string[]>(s.tags);
  const [note, setNote] = useState(s.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const body = () => JSON.stringify({ score, tags: picked, note });
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  async function send(action: 'publish' | 'draft') {
    setBusy(true); setError('');
    try {
      await api(`/api/submissions/${s.id}/${action}`, { method: 'POST', body: body() });
      if (action === 'publish') { say(`Grade published for ${s.student}. Their parent has been notified.`); await refresh(); } else say('Draft saved.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <article className="grade-card" aria-label={`Grade ${s.student}`}>
      <div className="g-left">
        <div className="g-head"><Avatar name={s.student} initials={s.initials} size={36} /><div className="grow"><h3>{s.student}</h3><small>Task: {s.task}</small></div><span className="tag tag-sky">{s.submitted}</span></div>
        {s.scratchpad ? (
          <div className="scratch">
            <div className="scratch-top"><span className="tag tag-white">{s.scratchpad.label}</span><span className="check"><ShieldCheck size={13} aria-hidden /> {s.scratchpad.check}</span></div>
            <svg viewBox="0 0 260 140" role="img" aria-label="Student scratchpad: a triangle reflected and rotated 180 degrees around the origin">
              <line x1="20" y1="70" x2="240" y2="70" className="dash" /><line x1="130" y1="10" x2="130" y2="130" className="dash" />
              <polygon points="95,70 130,70 95,40" className="tri" /><polygon points="165,70 130,70 165,100" className="tri tri-rot" />
              <circle cx="130" cy="70" r="3" className="dot" />
              <text x="136" y="64" className="lbl">Origin (0,0)</text><text x="84" y="36" className="lbl">ΔA</text><text x="172" y="112" className="lbl rose">ΔA′ (Rot 180°)</text>
            </svg>
            <div className="scratch-foot"><small>Total Attempts: {s.scratchpad.attempts} • Elapsed: {s.scratchpad.elapsedMins} mins</small><Soon className="link-soon"><Maximize2 size={12} aria-hidden /> Expand Full Canvas</Soon></div>
          </div>
        ) : <p className="scratch empty-scratch">{WITH_SCRATCHPAD_HINT}</p>}
      </div>
      <div className="g-right">
        <div className="score-row"><b>Assessment Score</b><label className="score-box"><input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} aria-label="Assessment score" /> / 100</label></div>
        <small className="lab">Praise &amp; Rubric Tags</small>
        <div className="presets">{tags.map((t) => <button key={t} type="button" className="fchip" aria-pressed={picked.includes(t)} onClick={() => toggle(t)}>{t}</button>)}</div>
        <div className="note-row"><small className="lab">Encouragement Note to Student &amp; Parent</small><Soon className="rec"><Mic size={12} aria-hidden /> Record 30s Audio</Soon></div>
        <textarea rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Encouragement note" placeholder="What did they do well? What should they try next?" />
        {error && <p className="err" role="alert">{error}</p>}
        <div className="actions row">
          <button type="button" className="btn-primary grow" disabled={busy} onClick={() => send('publish')}><LineChart size={15} aria-hidden /> Publish Grade &amp; Send Parent Sync</button>
          <button type="button" className="btn-white" disabled={busy} onClick={() => send('draft')}>Draft</button>
        </div>
      </div>
    </article>
  );
}

function Directory({ d, onAssign }: { d: Data; onAssign: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('all');
  const [students, setStudents] = useState<DirectoryStudent[]>(d.directory.students);
  const [error, setError] = useState('');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      try { setStudents((await api<{ students: DirectoryStudent[] }>(`/api/students?q=${encodeURIComponent(q)}&grade=${grade}`)).students); setError(''); } catch (e) { setError((e as Error).message); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, grade]);

  return (
    <section aria-labelledby="dir-h">
      <div className="sec-head">
        <Users size={20} aria-hidden />
        <div className="grow"><h2 id="dir-h">Active Students Directory</h2><p className="sub">Real-time mastery scores, Adversity Quotient tracking, and parent connection status.</p></div>
        <label className="search search-sm"><Search size={15} aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search student name" placeholder="Search student name..." /></label>
        <select className="grade-select" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Filter by grade">{d.directory.grades.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {students.length === 0 ? <p className="empty">No students match.</p> : (
        <div className="cards3">
          {students.map((s) => (
            <article key={s.id} className="student" aria-label={s.name}>
              <div className="who-row top"><Avatar name={s.name} initials={s.initials} size={48} /><div className="grow"><h3>{s.name}</h3><small>{s.grade}</small></div><span className="tag tag-sun">{s.mastery}% Mastery</span></div>
              <dl className="facts">
                <div><dt>Current Mastery Topic:</dt><dd>{s.topic}</dd></div>
                <div><dt>Adversity Quotient (AQ):</dt><dd className={`aq aq-${s.aqTone}`}>{s.aq}</dd></div>
                <div><dt>Last Session:</dt><dd>{s.lastSession}</dd></div>
              </dl>
              <div className="unit"><span>{s.unit}</span><b>{s.unitPct}%</b></div>
              <Bar pct={s.unitPct} tone={s.aqTone === 'sky' ? 'olive' : 'primary'} label={`${s.name} ${s.unit}`} />
              <div className="actions row"><button type="button" className="btn-soft grow" onClick={() => onAssign(s.id)} aria-label={`Assign task to ${s.name}`}>Assign Task</button><Soon className="round" label="View progress"><LineChart size={15} aria-hidden /></Soon><a className="round" href={chatUrl} aria-label={`Message ${s.name}`}><MessageSquare size={15} aria-hidden /></a></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
