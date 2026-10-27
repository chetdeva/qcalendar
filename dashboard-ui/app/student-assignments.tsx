'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, FileText, NotebookPen, Sparkles, Star, Target, Trophy, Users, Zap } from 'lucide-react';
import type { Assignment, Feedback, StudentDashboard as Data } from '@/lib/types';
import { Bar, Soon } from './components/ui';

export default function StudentAssignments({ d }: { d: Data }) {
  const [tab, setTab] = useState<'active' | 'graded'>('active');
  return (
    <div className="page"><section aria-labelledby="assign-h">
      <div className="sec-head">
        <span className="icon icon-sm tone-rose"><NotebookPen size={18} aria-hidden /></span>
        <div><h2 id="assign-h">My Assignments, Practice &amp; Feedback</h2><p className="sub">Track your tasks and read your teachers’ feedback.</p></div>
        <div className="segmented" role="tablist" aria-label="Assignments view">
          <button type="button" role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>Active Tasks ({d.assignments.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'graded'} onClick={() => setTab('graded')}>Graded &amp; Feedback ({d.feedback.length})</button>
        </div>
      </div>
      {tab === 'active' ? (
        <div className="split">
          <div>
            <h3 className="col-h">To-Do <span className="count">{d.assignments.length} Active</span></h3>
            {d.assignments.length === 0 ? <p className="empty">No tasks right now. Your teacher’s tasks will show up here.</p> : (
              <ul className="list" aria-label="Active tasks">{d.assignments.map((a, i) => <Task key={a.id} a={a} primary={i === 0} />)}</ul>
            )}
            <article className="sparky">
              <span className="icon tone-sun"><Sparkles size={22} aria-hidden /></span>
              <div><h4>Stuck on a tricky step?</h4><p>Ask Sparky AI to sketch intuition hints directly on your scratchpad (no spoiler answers!).</p></div>
              <Soon className="btn-pill"><Sparkles size={14} aria-hidden /> Ask Sparky Hint</Soon>
            </article>
          </div>
          <div>
            <h3 className="col-h">Recent Coach Feedback <span className="count count-plain">{d.feedback.length} Graded</span></h3>
            {d.feedback.length === 0 ? <p className="empty">No graded work yet.</p> : <div className="list">{d.feedback.slice(0, 2).map((f) => <FeedbackCard key={f.id} f={f} />)}</div>}
          </div>
        </div>
      ) : (
        d.feedback.length === 0 ? <p className="empty">No graded work yet.</p> : <div className="cards3 graded" role="tabpanel">{d.feedback.map((f) => <FeedbackCard key={f.id} f={f} />)}</div>
      )}
    </section></div>
  );
}

function Task({ a, primary }: { a: Assignment; primary: boolean }) {
  const pct = Math.round((a.doneSteps / a.totalSteps) * 100);
  return (
    <li className="task">
      <span className={`icon tone-${a.tone}`}>{a.tone === 'sky' ? <Target size={22} aria-hidden /> : <Trophy size={22} aria-hidden />}</span>
      <div className="task-body">
        <div className="task-title"><h4>{a.title}</h4><span className={`due due-${a.dueTone}`}>{a.due}</span></div>
        <p>{a.description}</p>
        <div className="progress-row"><Bar pct={pct} label={`${a.title} progress`} /><small>{a.status}</small></div>
      </div>
      <Link className={primary ? 'btn-primary' : 'btn-soft'} href={`/assignments/${a.id}`}><Zap size={14} aria-hidden /> {a.action}</Link>
    </li>
  );
}

function FeedbackCard({ f }: { f: Feedback }) {
  return (
    <article className="feedback" aria-label={`${f.title}, ${f.gradedLabel}`}>
      <div className="fb-top"><small>{f.gradedLabel}</small><span className={`score ${f.score >= 95 ? 'score-top' : ''}`}>{f.score >= 95 ? <Star size={12} aria-hidden /> : <Check size={12} aria-hidden />} Score: {f.score}/100 ({f.grade})</span></div>
      <h4>{f.title}</h4>
      <p className="coach"><Users size={12} aria-hidden /> {f.coach}</p>
      {f.tags.length > 0 && <ul className="tags">{f.tags.map((t) => <li key={t}>{t}</li>)}</ul>}
      {f.note && <blockquote>“{f.note}”</blockquote>}
      <Link className="btn-soft btn-block" href={`/assignments/${f.assignmentId}`}><FileText size={13} aria-hidden /> View Graded Task</Link>
    </article>
  );
}
