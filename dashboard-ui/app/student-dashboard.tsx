'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CalendarPlus, ChevronRight, Eye, FileText, Flame, GraduationCap, MessageSquare, MonitorPlay, Search, SlidersHorizontal, Sparkles, Star, Target, TrendingUp, Users, Video } from 'lucide-react';
import type { Mentor, Session, StudentDashboard as Data } from '@/lib/types';
import { calendarUrl, chatUrl } from '@/lib/env';
import { api } from './api-client';
import { Avatar, Bar, Soon } from './components/ui';

const initialsOf = (name: string) => name.replace(/^Coach\s+/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export default function StudentDashboard({ initial }: { initial: Data }) {
  const d = initial;
  return (
    <div className="page">
      <Welcome d={d} />
      <Progress d={d} />
      <Sessions sessions={d.sessions} />
      <MentorFinder d={d} />
    </div>
  );
}

function Welcome({ d }: { d: Data }) {
  const w = d.welcome;
  return (
    <section className="hero" aria-label="Welcome">
      <div className="hero-l">
        <p className="eyebrow-row"><span className="tag tag-sun">{d.profile.level}</span><span>{d.profile.term}</span></p>
        <h1>Welcome back, {w.name}! <span aria-hidden>🌟</span> <em>{w.headline}</em></h1>
        <p className="blurb">{w.blurb}</p>
        <ul className="chips">
          <li><Flame size={14} aria-hidden /> Current Streak: <b>{w.streakDays} Days</b></li>
          <li><Target size={14} aria-hidden /> AQ Score: <b className="blue">{w.aq === null ? '—' : `${w.aq}/100`}</b> (Tenacity)</li>
          <li><Star size={14} aria-hidden /> Points: <b>{w.points.toLocaleString('en-US')}</b></li>
          <li className="chip-quiet"><GraduationCap size={14} aria-hidden /> {d.profile.grade}</li>
        </ul>
      </div>
      <aside className="next-card" aria-label="Next session">
        {d.nextSession ? (
          <>
            <div className="next-top"><span className="live"><i />{d.nextSession.liveIn}</span><small>Classroom ID: {d.nextSession.classroomId}</small></div>
            <h2>{d.nextSession.title}</h2>
            <p className="who"><Users size={14} aria-hidden /> {d.nextSession.mentor}</p>
            {d.nextSession.meetingUrl
              ? <a className="btn-primary btn-block" href={d.nextSession.meetingUrl} target="_blank" rel="noopener noreferrer"><Video size={18} aria-hidden /> Join Live Classroom</a>
              : <a className="btn-primary btn-block" href={calendarUrl}><CalendarDays size={18} aria-hidden /> View in Calendar</a>}
          </>
        ) : (
          <>
            <h2>No class coming up</h2>
            <p className="who">Book a session with a mentor to get started.</p>
            <a className="btn-primary btn-block" href={calendarUrl}><CalendarPlus size={18} aria-hidden /> Open Calendar</a>
          </>
        )}
        <Soon className="btn-ghost btn-block"><Sparkles size={16} aria-hidden /> Launch AI Warm-Up with Sparky</Soon>
      </aside>
    </section>
  );
}

function Progress({ d }: { d: Data }) {
  const p = d.progress;
  return (
    <section className="strip" aria-label="Progress">
      <article className="tile">
        <span className="icon tone-sun"><TrendingUp size={22} aria-hidden /></span>
        <div><small>{p.streak.label}</small><b>{p.streak.value}</b><Bar pct={p.streak.pct} tone="olive" label={p.streak.label} /></div>
      </article>
      <article className="tile">
        <span className="icon tone-sky"><Target size={22} aria-hidden /></span>
        <div><small>{p.weekly.label}</small><b>{p.weekly.value}</b><Bar pct={p.weekly.pct} label={p.weekly.label} /></div>
      </article>
      <article className="tile">
        <span className="icon tone-rose"><Sparkles size={22} aria-hidden /></span>
        <div><small>{p.tenacity.label}</small><b>{p.tenacity.value}</b><span className="note">{p.tenacity.note}</span></div>
      </article>
    </section>
  );
}

function SectionHead({ icon, title, tone = 'sky', action }: { icon: React.ReactNode; title: string; tone?: string; action?: React.ReactNode }) {
  return <div className="sec-head"><span className={`icon icon-sm tone-${tone}`}>{icon}</span><h2>{title}</h2>{action}</div>;
}

function Sessions({ sessions }: { sessions: Session[] }) {
  return (
    <section aria-labelledby="sessions-h">
      <div className="sec-head">
        <span className="icon icon-sm tone-sky"><CalendarDays size={18} aria-hidden /></span>
        <h2 id="sessions-h">Upcoming Scheduled Classes &amp; Sessions</h2>
        <a className="link-end" href={calendarUrl}>Full Calendar View <ChevronRight size={14} aria-hidden /></a>
      </div>
      {sessions.length === 0 ? <p className="empty">No upcoming classes yet. When a teacher invites you, it shows up here.</p> : (
        <div className="cards3">
          {sessions.map((s) => (
            <article key={s.id} className={`session ${s.next ? 'session-next' : ''}`} aria-label={`${s.topic}, ${s.when}`}>
              <div className="session-top"><span className="when">{s.when}</span><span className={`badge badge-${s.tone}`}>{s.badge}</span></div>
              <div className="who-row">
                <Avatar name={s.who} initials={initialsOf(s.who)} size={44} />
                <div><h3>{s.who}</h3><small>{s.whoNote}</small></div>
              </div>
              <div className="topic"><small>{s.topicLabel}</small><h4>{s.topic}</h4>{s.blurb && <p>{s.blurb}</p>}</div>
              <div className="actions">
                {s.meetingUrl
                  ? <a className={s.next ? 'btn-primary btn-block' : 'btn-soft btn-block'} href={s.meetingUrl} target="_blank" rel="noopener noreferrer"><MonitorPlay size={16} aria-hidden /> {s.primary}</a>
                  : <a className="btn-soft btn-block" href={calendarUrl}><Eye size={14} aria-hidden /> {s.primary}</a>}
                {s.next && (
                  <div className="duo">
                    <Soon className="btn-soft"><FileText size={14} aria-hidden /> Class Prep Notes</Soon>
                    <a className="btn-soft" href={calendarUrl}><CalendarPlus size={14} aria-hidden /> Reschedule</a>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MentorFinder({ d }: { d: Data }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [mentors, setMentors] = useState<Mentor[]>(d.mentors);
  const [error, setError] = useState('');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; } // the page already came with all mentors
    const t = setTimeout(async () => {
      try {
        setMentors((await api<{ mentors: Mentor[] }>(`/api/mentors?q=${encodeURIComponent(q)}&filter=${filter}`)).mentors);
        setError('');
      } catch (e) { setError((e as Error).message); }
    }, 200);
    return () => clearTimeout(t);
  }, [q, filter]);

  return (
    <section className="panel" aria-labelledby="mentors-h">
      <div className="sec-head">
        <span className="icon icon-sm tone-sun"><Users size={18} aria-hidden /></span>
        <div><h2 id="mentors-h">Find &amp; Connect with Expert Mentors</h2><p className="sub">Certified teachers dedicated to visual, hands-on mathematical intuition.</p></div>
        <Soon className="btn-pill"><SlidersHorizontal size={14} aria-hidden /> More Filter Options</Soon>
      </div>
      <label className="search"><Search size={18} aria-hidden /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search teachers" placeholder="Search teachers by subject, grade level, topic (e.g. Geometry, Pre-Algebra, Coach Pprincy)..." /></label>
      <div className="filters" role="group" aria-label="Quick filters">
        <small>Quick Filters:</small>
        {d.mentorFilters.map((f) => <button key={f.id} type="button" className="fchip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {mentors.length === 0 ? <p className="empty">{q || filter !== 'all' ? 'No mentors match your search.' : 'No mentors have published a profile yet.'}</p> : (
        <div className="cards3 mentors">
          {mentors.map((m) => (
            <article key={m.id} className={`mentor ${m.primary ? 'mentor-primary' : ''}`} aria-label={m.name}>
              {m.primary && <span className="primary-badge"><Star size={11} aria-hidden /> Your Primary Coach</span>}
              <div className="who-row top">
                <Avatar name={m.name} initials={m.initials} size={64} />
                <div><h3>{m.name}</h3><small className="head-line">{m.headline}</small></div>
              </div>
              <ul className="tags">{m.specialties.map((t) => <li key={t}>{t}</li>)}</ul>
              <blockquote>“{m.quote}”</blockquote>
              <a className={m.primary ? 'btn-primary btn-block' : 'btn-soft btn-block'} href={calendarUrl}><CalendarPlus size={15} aria-hidden /> {m.primary ? 'Book Extra 1:1 Session' : 'Book 1:1 Session'}</a>
              <div className="duo">
                <Soon className="btn-soft"><Eye size={14} aria-hidden /> View Profile</Soon>
                <a className="btn-soft" href={chatUrl}><MessageSquare size={14} aria-hidden /> Send Message</a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
