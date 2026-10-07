'use client';

import { useState } from 'react';
import { ArrowRight, Flame, GraduationCap, Mic, SlidersHorizontal, Video } from 'lucide-react';
import { portals } from '@/content/site';

const { student: s, teacher: t } = portals;

// Pentagon radar from the four topic scores plus one fixed axis; purely illustrative.
function Radar() {
  const labels = ['Algebraic Thinking', 'Geometry', 'Proportions', 'Probability', 'Fluency'];
  const vals = [92, 88, 76, 84, 80];
  const pt = (i: number, r: number) => {
    const a = (-90 + i * 72) * (Math.PI / 180);
    return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
  };
  const poly = (f: (i: number) => number) => labels.map((_, i) => pt(i, f(i)).join(',')).join(' ');
  return (
    <svg viewBox="-30 0 260 200" className="radar" role="img" aria-label="Topic proficiency radar chart">
      <polygon points={poly(() => 80)} fill="none" stroke="#dbe5f7" />
      <polygon points={poly(() => 40)} fill="none" stroke="#dbe5f7" />
      <polygon points={poly((i) => (vals[i] / 100) * 80)} fill="rgba(0,91,191,.15)" stroke="#005bbf" strokeWidth="2" />
      {labels.map((l, i) => {
        const [x, y] = pt(i, 94);
        return <text key={l} x={x} y={y} fontSize="8" textAnchor="middle" fill="#414754">{l}</text>;
      })}
    </svg>
  );
}

export default function Portals() {
  const [tab, setTab] = useState<'student' | 'teacher'>('student');

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Portal view">
        <button role="tab" id="tab-student" aria-selected={tab === 'student'} aria-controls="panel" onClick={() => setTab('student')}>
          <GraduationCap size={16} aria-hidden /> Student Experience
        </button>
        <button role="tab" id="tab-teacher" aria-selected={tab === 'teacher'} aria-controls="panel" onClick={() => setTab('teacher')}>
          <SlidersHorizontal size={16} aria-hidden /> Teacher Management
        </button>
      </div>

      <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'student' ? (
          <>
            <div className="live">
              <span className="live-ico"><Video size={22} aria-hidden /></span>
              <div>
                <span className="chip chip-dark">{s.live.when}</span>
                <h3>{s.live.title}</h3>
                <p>{s.live.topic}</p>
              </div>
              <div className="live-actions">
                <span className="chip chip-dark"><Mic size={14} aria-hidden /> Test Audio &amp; Cam</span>
                <span className="btn btn-primary">Enter Classroom <ArrowRight size={16} aria-hidden /></span>
              </div>
            </div>

            <div className="portal-grid">
              <div className="stack">
                <div className="card">
                  <div className="row"><span className="eyebrow">{s.level.label}</span><span className="chip chip-amber"><Flame size={13} aria-hidden /> {s.level.streak}</span></div>
                  <h3>{s.level.name}</h3>
                  <div className="row small"><span>{s.level.xp.toLocaleString('en-US')} XP Earned</span><span>{s.level.next} XP to Level 8</span></div>
                  <div className="bar" role="progressbar" aria-valuenow={82} aria-valuemin={0} aria-valuemax={100} aria-label="XP progress"><i style={{ width: '82%' }} /></div>
                  <p className="eyebrow gap">Earned milestones</p>
                  <div className="miles">{s.level.milestones.map((m) => <span key={m}>{m}</span>)}</div>
                </div>
                <div className="card">
                  <div className="row"><h3>Digital Assignment Locker</h3><span className="chip chip-blue">2 Pending</span></div>
                  {s.assignments.map((a) => (
                    <div key={a.title} className="assign">
                      <div className="row small"><span className="chip chip-blue">{a.kind}</span><span>{a.due}</span></div>
                      <strong>{a.title}</strong>
                      <div className="row small"><span>{a.meta}</span><span className="link">{a.action}</span></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="row"><div><p className="eyebrow">{s.radar.eyebrow}</p><h3>{s.radar.title}</h3></div><span className="chip">{s.radar.overall}</span></div>
                <div className="radar-row">
                  <Radar />
                  <div className="topics">
                    {s.radar.topics.map(([name, pct]) => (
                      <div key={name}>
                        <div className="row small"><span>{name}</span><b>{pct}%</b></div>
                        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="coach-note"><b>Coach Note:</b> {s.radar.note}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="card">
            <h3>{t.title}</h3>
            {t.rows.map((r) => (
              <div key={r.name} className="assign">
                <div className="row"><strong>{r.name}</strong><span className="small">{r.time}</span></div>
                <div className="row small"><span>{r.topic}</span><span className="chip chip-blue">{r.status}</span></div>
              </div>
            ))}
            <p className="muted small">{t.note}</p>
          </div>
        )}
      </div>
    </>
  );
}
