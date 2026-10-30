'use client';

import { useEffect, useRef, useState } from 'react';
import { BookOpen, CalendarClock, ClipboardCheck, Eye, IdCard, LineChart, MessageSquare, PenLine, Search, Users, Video, DoorOpen, UserPen } from 'lucide-react';
import { LEVELS, type DirectoryStudent, type Level, type MentorProfile, type TeacherDashboard as Data, type TeacherSession } from '@/lib/types';
import { calendarUrl, chatUrl } from '@/lib/env';
import { api } from './api-client';
import { Avatar, Bar, Soon } from './components/ui';

const GRADES = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);
const LEVEL_LABEL: Record<Level, string> = { elementary: 'Elementary (1–5)', middle: 'Middle (6–8)', high: 'High (9–10)', olympiad: 'Olympiad / Competitions' };

export default function TeacherDashboard({ initial }: { initial: Data }) {
  const [d, setD] = useState(initial);
  const [toast, setToast] = useState('');

  const refresh = async () => setD((await api<{ teacher: Data }>('/api/dashboard?view=teacher')).teacher);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000); };

  return (
    <div className="page">
      <WelcomeBar d={d} />
      <Schedule d={d} />
      <Directory d={d} refresh={refresh} say={say} />
      <ProfileCard profile={d.mentorProfile} say={say} />
      <p className="toast" role="status" aria-live="polite">{toast}</p>
    </div>
  );
}

function WelcomeBar({ d }: { d: Data }) {
  return (
    <section className="hero hero-teacher" aria-label="Welcome">
      <div className="welcome-row">
        <Avatar name={d.profile.name} initials={d.profile.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()} size={72} />
        <div className="grow">
          <p className="eyebrow-row"><span className="tag tag-sky">{d.profile.title}</span><span className="tag tag-sun"><i className="dot" /> {d.profile.status}</span></p>
          <h1>Welcome, {d.welcome.name}!</h1>
          <p className="blurb">{d.welcome.blurb}</p>
        </div>
        <div className="fast">
          <Soon className="btn-primary"><PenLine size={15} aria-hidden /> Instant Whiteboard</Soon>
          <a className="btn-white" href="/assignments"><ClipboardCheck size={15} aria-hidden /> New Quest / Task</a>
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
      {!hero && <p className="empty">No classes today. Classes you schedule in the calendar appear here.</p>}
      {hero && (hero.hero ? <HeroSession s={hero} /> : <ul className="rows"><SessionRow s={hero} /></ul>)}
      <ul className="rows">{rest.map((s) => <SessionRow key={s.id} s={s} />)}</ul>
      {d.schedule.officeHours && <p className="office"><CalendarClock size={15} aria-hidden /> {d.schedule.officeHours.label} <small>{d.schedule.officeHours.rsvps} RSVPs</small></p>}
    </section>
  );
}

function HeroSession({ s }: { s: TeacherSession }) {
  return (
    <article className="session-hero" aria-label={`${s.student}, ${s.time}`}>
      <div className="sh-top"><span className="live"><i />{s.startsIn}</span><small>{s.time}</small><span className="tag tag-sun">{s.kind}</span></div>
      <div className="who-row top"><Avatar name={s.student} initials={s.initials} size={52} /><div className="grow"><h3>{s.student}</h3><small>{s.grade ? `${s.grade} • ` : ''}{s.detail}</small></div></div>
      <p className="topic-row"><small>Topic:</small> <b>{s.topic}</b></p>
      {s.notes && <p className="parent-note">Class notes: {s.notes}</p>}
      <div className="actions row">
        {s.meetingUrl
          ? <a className="btn-primary" href={s.meetingUrl} target="_blank" rel="noopener noreferrer"><DoorOpen size={15} aria-hidden /> Enter Classroom Now</a>
          : <a className="btn-primary" href={calendarUrl}><DoorOpen size={15} aria-hidden /> Open in Calendar</a>}
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

function Directory({ d, refresh, say }: { d: Data; refresh: () => Promise<void>; say: (m: string) => void }) {
  const [q, setQ] = useState('');
  const [grade, setGrade] = useState('all');
  const [students, setStudents] = useState<DirectoryStudent[]>(d.directory.students);
  const [error, setError] = useState('');
  const first = useRef(true);

  const load = async () => {
    try { setStudents((await api<{ students: DirectoryStudent[] }>(`/api/students?q=${encodeURIComponent(q)}&grade=${grade}`)).students); setError(''); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [q, grade]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStudentGrade(s: DirectoryStudent, value: string) {
    try { await api(`/api/students/${s.id}/settings`, { method: 'PUT', body: JSON.stringify({ grade: value || null }) }); say(`${s.name}’s grade saved.`); await Promise.all([load(), refresh()]); } catch (e) { setError((e as Error).message); }
  }

  return (
    <section aria-labelledby="dir-h">
      <div className="sec-head">
        <Users size={20} aria-hidden />
        <div className="grow"><h2 id="dir-h">Active Students Directory</h2><p className="sub">Mastery scores, Adversity Quotient tracking and progress for the students in your classes.</p></div>
        <label className="search search-sm"><Search size={15} aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search student name" placeholder="Search student name..." /></label>
        <select className="grade-select" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Filter by grade">{d.directory.grades.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</select>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {students.length === 0 ? <p className="empty">{q || grade !== 'all' ? 'No students match.' : 'No students yet. People appear here once you have a class with them.'}</p> : (
        <div className="cards3">
          {students.map((s) => (
            <article key={s.id} className="student" aria-label={s.name}>
              <div className="who-row top"><Avatar name={s.name} initials={s.initials} size={48} /><div className="grow"><h3>{s.name}</h3>
                <select className="grade-pick" value={s.grade} aria-label={`Grade for ${s.name}`} onChange={(e) => setStudentGrade(s, e.target.value)}><option value="">Grade not set</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></div>
                <span className="tag tag-sun">{s.mastery === null ? 'No grades yet' : `${s.mastery}% Mastery`}</span></div>
              <dl className="facts">
                <div><dt>Current Mastery Topic:</dt><dd>{s.topic}</dd></div>
                <div><dt>Adversity Quotient (AQ):</dt><dd className={`aq aq-${s.aqTone}`}>{s.aq}</dd></div>
                <div><dt>Last Session:</dt><dd>{s.lastSession}</dd></div>
              </dl>
              <div className="unit"><span>{s.unit}</span><b>{s.unitPct}%</b></div>
              <Bar pct={s.unitPct} tone={s.aqTone === 'sky' ? 'olive' : 'primary'} label={`${s.name} ${s.unit}`} />
              <div className="actions row"><a className="btn-soft grow" href={`/assignments?student=${s.id}`} aria-label={`Assign task to ${s.name}`}>Assign Task</a><Soon className="round" label="View progress"><LineChart size={15} aria-hidden /></Soon><a className="round" href={chatUrl} aria-label={`Message ${s.name}`}><MessageSquare size={15} aria-hidden /></a></div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** What students see on their mentor card. Nothing is shown until the teacher publishes it. */
function ProfileCard({ profile, say }: { profile: MentorProfile; say: (m: string) => void }) {
  const [headline, setHeadline] = useState(profile.headline);
  const [specialties, setSpecialties] = useState(profile.specialties.join(', '));
  const [levels, setLevels] = useState<Level[]>(profile.levels);
  const [quote, setQuote] = useState(profile.quote);
  const [published, setPublished] = useState(profile.published);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/me/mentor-profile', { method: 'PUT', body: JSON.stringify({ headline, specialties: specialties.split(',').map((x) => x.trim()).filter(Boolean), levels, quote, published }) });
      say(published ? 'Profile saved. Students can now find you under Mentors.' : 'Profile saved. It is hidden from students until you publish it.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="profile-h">
      <div className="sec-head"><UserPen size={20} aria-hidden /><div className="grow"><h2 id="profile-h">My Mentor Profile</h2><p className="sub">This is what students see when they look for a mentor.</p></div></div>
      <form className="builder" onSubmit={save}>
        <label className="fld">Headline<input maxLength={120} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Lead STEM Specialist • M.Ed." /></label>
        <label className="fld">Specialties (separated by commas)<input value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="Geometry, Proofs & Logic" /></label>
        <fieldset><legend>Grade levels you teach</legend>
          <div className="presets">{LEVELS.map((l) => <button key={l} type="button" className="fchip" aria-pressed={levels.includes(l)} onClick={() => setLevels((c) => (c.includes(l) ? c.filter((x) => x !== l) : [...c, l]))}>{LEVEL_LABEL[l]}</button>)}</div>
        </fieldset>
        <label className="fld">A line in your own words<textarea rows={3} maxLength={400} value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="What do you want students to know about how you teach?" /></label>
        <label className="check"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Show my profile to students</label>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>Save profile</button>
      </form>
    </section>
  );
}
