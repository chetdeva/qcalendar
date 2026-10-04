import type { CalendarEvent, EventCategory } from '@/lib/calendar';
import { CATEGORIES, CATEGORY_ORDER, initials, nameFromEmail, rangeLabel } from '@/lib/format';
import { Icon } from './ui-icon';

export interface LessonForm {
  title: string;
  date: string;
  time: string;
  duration: number;
  attendees: string;
  meet: boolean;
  category: EventCategory;
}

const DURATIONS = [30, 60, 75, 90];

interface CreateProps {
  form: LessonForm;
  setForm: (f: LessonForm) => void;
  emails: { valid: string[]; invalid: string[] };
  missing: string[];
  busy: boolean;
  error: string;
  conflict: boolean;
  connected: boolean | null;
  studentSessions: number | null;
  onCreate: (force: boolean) => void;
  onClose: () => void;
}

export function CreateDrawer(p: CreateProps) {
  const { form, setForm } = p;
  const first = p.emails.valid[0];
  const set = <K extends keyof LessonForm>(k: K, v: LessonForm[K]) => setForm({ ...form, [k]: v });
  const canBook = p.missing.length === 0;
  const inviteNote = !p.connected
    ? 'Saved here only until Google Calendar is connected'
    : form.meet
      ? 'Sends calendar invite + automatic Google Meet'
      : 'Sends calendar invite';

  return (
    <aside className="drawer" aria-label="New lesson">
      <div className="d-head">
        <div className="d-head-l">
          <span className="d-icon"><Icon name="header-add" color="#005bbf" /></span>
          <div>
            <h3>New Lesson</h3>
            <p>Add slot &amp; trigger Google Calendar push</p>
          </div>
        </div>
        <button type="button" className="d-close" aria-label="Close panel" onClick={p.onClose}>
          <Icon name="close" color="#414754" />
        </button>
      </div>

      <div className="d-body">
        <label className="field">
          <span>Event Title *</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="AP Statistics - Private Session" />
        </label>

        <div className="field">
          <label htmlFor="student-email">Student Email *</label>
          <div className="with-icon">
            <span className="in-icon"><Icon name="mail" color="#727785" /></span>
            <input id="student-email" value={form.attendees} onChange={(e) => set('attendees', e.target.value)} placeholder="student@example.com" />
          </div>
          <div className={`hint ${p.connected ? 'ok' : 'warn'}`}>
            <Icon name="verified-sync" color={p.connected ? '#006c4a' : '#854f0b'} />
            {inviteNote}
          </div>
        </div>

        <div className="field">
          <span id="session-type">Session Type</span>
          <div className="seg" role="group" aria-labelledby="session-type">
            {CATEGORY_ORDER.map((c) => (
              <button
                key={c}
                type="button"
                className={form.category === c ? 'on' : ''}
                aria-pressed={form.category === c}
                style={form.category === c ? { color: CATEGORIES[c].color } : undefined}
                onClick={() => set('category', c)}
              >
                <Icon name={c === 'tutoring' ? 'tutoring' : c === 'office_hours' ? 'office-hours' : 'personal'} color={form.category === c ? CATEGORIES[c].color : '#414754'} />
                {CATEGORIES[c].label}
              </button>
            ))}
          </div>
        </div>

        <div className="row2">
          <label className="field">
            <span>Date *</span>
            <input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label className="field">
            <span>Start Time *</span>
            <input type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>

        <div className="field">
          <span id="duration">Duration</span>
          <div className="durations" role="group" aria-labelledby="duration">
            {(DURATIONS.includes(form.duration) ? DURATIONS : [...DURATIONS, form.duration].sort((a, b) => a - b)).map((m) => (
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
              <b>Add Google Meet</b>
              <small>Auto-generates meeting link</small>
            </div>
            <button type="button" role="switch" aria-checked={form.meet} aria-label="Add Google Meet" className="switch" onClick={() => set('meet', !form.meet)} />
          </div>
          <div className="toggle-row">
            <span className="t-ico"><Icon name="sync-toggle" color="#006c4a" /></span>
            <div className="t-text">
              <b>Sync to Google Calendar</b>
              <small>{p.connected ? "Blocks slot in tutor's master cal" : 'Connect Google in calendar-service'}</small>
            </div>
            <button type="button" role="switch" aria-checked={Boolean(p.connected)} aria-label="Sync to Google Calendar" aria-disabled="true" disabled className="switch green" />
          </div>
        </div>

        {first && (
          <div className="student-card">
            <span className="avatar">{initials(nameFromEmail(first))}</span>
            <div className="s-text">
              <b>{nameFromEmail(first)} (Client)</b>
              <small><span className="dot-sm" />{p.studentSessions === null ? 'Checking history…' : `${p.studentSessions} ${p.studentSessions === 1 ? 'session' : 'sessions'} booked`}</small>
            </div>
            <Icon name="arrow-right" color="#727785" />
          </div>
        )}

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
  connected: boolean | null;
  error: string;
  onCancel: () => void;
  onNew: () => void;
  onClose: () => void;
}

export function DetailsDrawer({ ev, connected, error, onCancel, onNew, onClose }: DetailsProps) {
  const cat = CATEGORIES[ev.category];
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
        <div className="detail">
          <b className="detail-title">{ev.title}</b>
          <span>{new Date(ev.start).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          <span>{rangeLabel(ev.start, ev.end)}</span>
        </div>
        {ev.attendees.length > 0 && (
          <div className="field">
            <span>Attendees</span>
            <ul className="attendees">
              {ev.attendees.map((a) => (
                <li key={a}><span className="avatar sm">{initials(nameFromEmail(a))}</span>{a}</li>
              ))}
            </ul>
          </div>
        )}
        {ev.meetUrl && (
          <a className="meet-link" href={ev.meetUrl} target="_blank" rel="noreferrer">
            <Icon name="video" color="#005bbf" /> Join Google Meet
          </a>
        )}
        <div className={`hint ${ev.syncStatus === 'synced' ? 'ok' : 'warn'}`}>
          <Icon name="verified-sync" color={ev.syncStatus === 'synced' ? '#006c4a' : '#854f0b'} />
          {ev.syncStatus === 'synced' ? 'On your Google Calendar' : connected ? 'Waiting to sync to Google Calendar' : 'Not on Google Calendar yet'}
        </div>
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
