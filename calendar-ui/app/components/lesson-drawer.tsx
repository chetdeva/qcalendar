'use client';

import { useEffect, useState } from 'react';
import type { CalendarEvent, EventCategory, Participant, Person, Student } from '@/lib/calendar';
import { answerSummary, CATEGORIES, CATEGORY_ORDER, hm, initials, minutesBetween, personName, STATUS_LABEL, ymd, zoneTime } from '@/lib/format';
import { ChangeRequestBox } from './change-request-box';
import { StudentPicker } from './student-picker';
import { DateField } from './date-field';
import { Icon } from './ui-icon';

export interface LessonForm {
  title: string;
  date: string;
  time: string;
  duration: number;
  students: Student[];
  meet: boolean;
  category: EventCategory;
  /** Admins only: whose calendar the class goes on. */
  teacher: Person | null;
}

/** A 409 from the service: the teacher is busy, or some of the chosen students already are. */
export type Conflict = { kind: 'owner' | 'students' | 'hours'; people: string[] };

const DURATIONS = [30, 60, 75, 90];
/** The free trial class is always this long. */
const TRIAL_MINUTES = 30;
const iconFor = (c: EventCategory) => (c === 'tutoring' || c === 'trial' ? 'tutoring' : c === 'office_hours' ? 'office-hours' : 'personal');

export function conflictMessage(c: Conflict) {
  return c.kind === 'owner'
    ? 'That time overlaps another class on the calendar.'
    : c.kind === 'hours'
      ? "That time is outside this teacher's working hours."
      : `Already in another class at this time: ${c.people.join(', ')}.`;
}

/** The class start as a Date, or null while the date or time is empty. */
const startOf = (date: string, time: string) => { const d = date && time ? new Date(`${date}T${time}`) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };

interface CreateProps {
  form: LessonForm;
  setForm: (f: LessonForm) => void;
  role: 'teacher' | 'admin';
  teachers: Person[];
  missing: string[];
  busy: boolean;
  error: string;
  conflict: Conflict | null;
  onCreate: (force: boolean) => void;
  onClose: () => void;
}

export function CreateDrawer(p: CreateProps) {
  const { form, setForm } = p;
  const set = <K extends keyof LessonForm>(k: K, v: LessonForm[K]) => setForm({ ...form, [k]: v });
  const canBook = p.missing.length === 0;

  return (
    <aside className="drawer" aria-label="New lesson">
      <div className="d-head">
        <div className="d-head-l">
          <span className="d-icon"><Icon name="header-add" color="#005bbf" /></span>
          <div>
            <h3>New Lesson</h3>
            <p>Add a class and email the invitations</p>
          </div>
        </div>
        <button type="button" className="d-close" aria-label="Close panel" onClick={p.onClose}>
          <Icon name="close" color="#414754" />
        </button>
      </div>

      <div className="d-body">
        {p.role === 'admin' && (
          <label className="field">
            <span>Teacher *</span>
            <select value={form.teacher?.id ?? ''} onChange={(e) => set('teacher', p.teachers.find((t) => t.id === e.target.value) ?? null)}>
              <option value="">Choose a teacher</option>
              {p.teachers.map((t) => <option key={t.id} value={t.id}>{personName(t)}</option>)}
            </select>
          </label>
        )}

        <label className="field">
          <span>Event Title *</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="AP Statistics - Private Session" />
        </label>

        <StudentPicker label="Students" required={form.category === 'tutoring' || form.category === 'trial'} value={form.students} onChange={(v) => set('students', v)} at={startOf(form.date, form.time)} />
        <div className="hint ok"><Icon name="verified-sync" color="#006c4a" />Each student gets an email invitation</div>

        <div className="field">
          <span id="session-type">Session Type</span>
          <div className="seg" role="group" aria-labelledby="session-type">
            {CATEGORY_ORDER.filter((c) => c !== 'office_hours').map((c) => ( // office hours are no longer offered when creating a class (existing ones still show)
              <button
                key={c}
                type="button"
                className={form.category === c ? 'on' : ''}
                aria-pressed={form.category === c}
                style={form.category === c ? { color: CATEGORIES[c].color } : undefined}
                onClick={() => setForm({ ...form, category: c, ...(c === 'trial' ? { duration: TRIAL_MINUTES } : {}) })}
              >
                <Icon name={iconFor(c)} color={form.category === c ? CATEGORIES[c].color : '#414754'} />
                {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        </div>

        <div className="row2">
          <DateField label="Date *" value={form.date} onChange={(v) => set('date', v)} />
          <label className="field">
            <span>Start Time *</span>
            <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>

        <div className="field">
          <span id="duration">Duration</span>
          <div className="durations" role="group" aria-labelledby="duration">
            {(form.category === 'trial' ? [TRIAL_MINUTES] : DURATIONS.includes(form.duration) ? DURATIONS : [...DURATIONS, form.duration].sort((a, b) => a - b)).map((m) => (
              <button key={m} type="button" className={form.duration === m ? 'on' : ''} aria-pressed={form.duration === m} onClick={() => set('duration', m)}>
                {m}m
              </button>
            ))}
          </div>
        </div>

        <div className="toggles">
          <div className="toggle-row">
            <span className="t-ico"><Icon name="meet-toggle" color="#005bbf" /></span>
            <div className="t-text">
              <b>Add video meeting</b>
              <small>Creates a private meeting link</small>
            </div>
            <button type="button" role="switch" aria-checked={form.meet} aria-label="Add video meeting" className="switch" onClick={() => set('meet', !form.meet)} />
          </div>
        </div>

        <div className="actions">
          <button type="button" className="cta" disabled={p.busy || !canBook} onClick={() => p.onCreate(false)}>
            <Icon name="send" color="#fff" />
            Create &amp; Send Invites
          </button>
          {!canBook && <p className="missing" data-testid="missing">Needs {p.missing.join(', ')}.</p>}
          {p.error && <p className="err">{p.error}</p>}
          {p.conflict && <button type="button" className="ghost" onClick={() => p.onCreate(true)}>Book anyway</button>}
        </div>
      </div>
    </aside>
  );
}

interface DetailsProps {
  ev: CalendarEvent;
  onDecide: (ev: CalendarEvent, requestId: string, decision: 'approve' | 'reject') => void;
  role: 'teacher' | 'admin';
  error: string;
  conflict: Conflict | null;
  busy: boolean;
  onCancel: () => void;
  onNew: () => void;
  onClose: () => void;
  onAdd: (students: Student[], force: boolean) => Promise<boolean>;
  onRemove: (p: Participant) => void;
  /** Save a changed title, date, time or length. Resolves true when it was saved. */
  onSave: (patch: { title: string; start: string; durationMinutes: number }, force: boolean) => Promise<boolean>;
}

export function DetailsDrawer({ ev, role, error, conflict, busy, onCancel, onNew, onClose, onAdd, onRemove, onDecide, onSave }: DetailsProps) {
  const cat = CATEGORIES[ev.category];
  const [adding, setAdding] = useState<Student[]>([]);
  const editable = ev.status === 'confirmed';
  const first = new Date(ev.start);
  const [title, setTitle] = useState(ev.title);
  const [date, setDate] = useState(ymd(first));
  const [time, setTime] = useState(hm(first));
  const [duration, setDuration] = useState(minutesBetween(ev.start, ev.end));
  const start = startOf(date, time);
  const dirty = title.trim() !== ev.title || date !== ymd(first) || time !== hm(first) || duration !== minutesBetween(ev.start, ev.end);
  const save = (force: boolean) => start && onSave({ title: title.trim(), start: start.toISOString(), durationMinutes: duration }, force);

  // Each student's own time zone, to show what the class time is for them.
  const [zones, setZones] = useState<Record<string, string>>({});
  const ids = ev.participants.map((p) => p.userId).filter(Boolean).join(',');
  useEffect(() => {
    if (!ids) return;
    let stale = false;
    fetch(`/api/students/zones?ids=${ids}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stale && j) setZones(j.zones); }, () => {});
    return () => { stale = true; };
  }, [ids]);
  const summary = answerSummary(ev.participants);
  const add = async (force: boolean) => { if (await onAdd(adding, force)) setAdding([]); };

  return (
    <aside className="drawer" aria-label="Lesson details">
      <div className="d-head">
        <div className="d-head-l">
          <span className="d-icon"><Icon name={cat.icon} color={cat.color} /></span>
          <div>
            <h3>Lesson details</h3>
            <p>{cat.short}</p>
          </div>
        </div>
        <button type="button" className="d-close" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" color="#414754" />
        </button>
      </div>
      <div className="d-body">
        <label className="field">
          <span>Event Title *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!editable} />
        </label>
        <div className="row2">
          <DateField label="Date *" value={date} onChange={setDate} disabled={!editable} />
          <label className="field">
            <span>Start Time *</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!editable} />
          </label>
        </div>
        <div className="field">
          <span id="edit-duration">Duration</span>
          <div className="durations" role="group" aria-labelledby="edit-duration">
            {(DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b)).map((m) => (
              <button key={m} type="button" className={duration === m ? 'on' : ''} aria-pressed={duration === m} disabled={!editable} onClick={() => setDuration(m)}>{m}m</button>
            ))}
          </div>
        </div>
        {role === 'admin' && <p className="muted-line">Teacher: {ev.ownerName ?? ev.ownerEmail ?? 'unknown'}</p>}
        {editable && (
          <div className="save-row">
            <button type="button" className="cta" disabled={busy || !dirty || !title.trim() || !start} onClick={() => save(false)}>Save changes</button>
            {conflict && dirty && <button type="button" className="ghost" onClick={() => save(true)}>Save anyway</button>}
          </div>
        )}

        {ev.meetingUrl && (
          <a className="meet-link" href={ev.meetingUrl} target="_blank" rel="noreferrer">
            <Icon name="video" color="#005bbf" /> Join video meeting
          </a>
        )}

        <ChangeRequestBox ev={ev} busy={busy} onDecide={onDecide} />

        <div className="field">
          <span>Students{ev.participants.length ? ` (${ev.participants.length})` : ''}</span>
          {summary && <small className="hint">{summary}</small>}
          {ev.participants.length === 0 && <p className="muted-line">No students in this class yet.</p>}
          <ul className="attendees" aria-label="Students in this class">
            {ev.participants.map((p) => (
              <li key={p.id}>
                <span className="avatar sm" aria-hidden="true">{initials(personName(p))}</span>
                <span className="who-line"><b>{personName(p)}</b><small>{p.email}</small>{p.userId && zones[p.userId] && start && <small className="zone-time">{zoneTime(start, zones[p.userId])}</small>}</span>
                <span className={`status status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                {ev.status === 'confirmed' && (
                  <button type="button" className="x-btn" aria-label={`Remove ${p.email}`} onClick={() => onRemove(p)}>
                    <Icon name="close" color="#414754" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {ev.status === 'confirmed' && (
          <div className="add-box">
            <StudentPicker label="Add students" value={adding} onChange={setAdding} exclude={ev.participants.map((p) => p.email)} at={start} />
            <button type="button" className="ghost" disabled={busy || adding.length === 0} onClick={() => add(false)}>Add to class</button>
            {conflict && <button type="button" className="ghost" onClick={() => add(true)}>Add anyway</button>}
          </div>
        )}

        <div className="actions">
          <button type="button" className="cta" onClick={onNew}>
            <Icon name="plus-circle" color="#fff" />
            New lesson
          </button>
          <button type="button" className="danger" onClick={onCancel}>Cancel lesson</button>
          {error && <p className="err">{error}</p>}
        </div>
      </div>
    </aside>
  );
}
