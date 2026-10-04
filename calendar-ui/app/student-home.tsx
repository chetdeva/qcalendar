'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import type { CalendarEvent, Me } from '@/lib/calendar';
import { CATEGORIES, rangeLabel, STATUS_LABEL } from '@/lib/format';
import { api } from './api-client';
import { CalendarToolbar, type ViewType } from './components/calendar-toolbar';
import { dayHeader, makeEventContent } from './components/event-content';
import { UserMenu } from './components/user-menu';
import { Icon } from './components/ui-icon';

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const slotLabel = (a: { date: Date }) => a.date.toLocaleTimeString('en-US', { hour: 'numeric' });
const DAY = 86_400_000;

const dayHeading = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

/** A student's view: their own classes to accept or decline, and a read-only calendar. They cannot create or change anything. */
export default function StudentHome({ me }: { me: Me }) {
  const cal = useRef<FullCalendar>(null);
  const [view, setView] = useState<ViewType>('timeGridWeek');
  const [title, setTitle] = useState('');
  const [tz, setTz] = useState('');
  const [classes, setClasses] = useState<CalendarEvent[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());

  const refetch = () => cal.current?.getApi().refetchEvents();

  const loadList = useCallback(async () => {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    try {
      const { events } = await api<{ events: CalendarEvent[] }>(`/api/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(from.getTime() + 120 * DAY).toISOString())}`);
      setClasses(events);
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setClasses([]);
    }
  }, []);

  useEffect(() => {
    void loadList();
    setTz(new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '');
  }, [loadList]);

  const loadRange = useCallback(async (info: { start: Date; end: Date }): Promise<EventInput[]> => {
    try {
      const qs = `from=${encodeURIComponent(info.start.toISOString())}&to=${encodeURIComponent(info.end.toISOString())}`;
      const { events } = await api<{ events: CalendarEvent[] }>(`/api/events?${qs}`);
      return events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, extendedProps: { ev: e }, editable: false }));
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }, []);
  const eventSource = useCallback(
    (info: { start: Date; end: Date }, ok: (e: EventInput[]) => void, fail: (e: Error) => void) => { loadRange(info).then(ok, fail); },
    [loadRange],
  );
  const onDates = useCallback((a: DatesSetArg) => { setTitle(a.view.title); setView(a.view.type as ViewType); }, []);
  const eventContent = useMemo(() => makeEventContent({ showTeacher: true, showStudents: false }), []);

  const now = Date.now();
  const upcoming = (classes ?? []).filter((c) => Date.parse(c.end) > now && c.status === 'confirmed');
  const needsAnswer = upcoming.filter((c) => c.myStatus === 'invited');
  const answered = upcoming.filter((c) => c.myStatus !== 'invited');

  async function answer(c: CalendarEvent, response: 'accepted' | 'declined') {
    setBusyId(c.id);
    setError('');
    try {
      const updated = await api<CalendarEvent>(`/api/events/${c.id}/respond`, { method: 'POST', body: JSON.stringify({ response }) });
      setClasses((list) => (list ?? []).map((x) => (x.id === c.id ? updated : x)));
      refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function select(id: string) {
    setSelected(id);
    cardRefs.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const nav = (a: 'prev' | 'next' | 'today') => {
    const c = cal.current?.getApi();
    if (a === 'prev') c?.prev();
    else if (a === 'next') c?.next();
    else c?.today();
  };

  const card = (c: CalendarEvent) => {
    const cat = CATEGORIES[c.category];
    const status = c.myStatus ?? 'invited';
    return (
      <article key={c.id} ref={(el) => { if (el) cardRefs.current.set(c.id, el); }} className={`class-card ${selected === c.id ? 'sel' : ''}`} aria-label={`${c.title}, ${dayHeading(c.start)}`}
        style={{ ['--accent' as string]: cat.color }} onClick={() => setSelected(c.id)}>
        <div className="cc-head">
          <b>{c.title}</b>
          <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        <div className="cc-when">{dayHeading(c.start)} · {rangeLabel(c.start, c.end)}</div>
        <div className="cc-who">With {c.ownerName ?? 'your teacher'}{c.participantCount > 1 ? ` · ${c.participantCount} students` : ''}</div>
        {c.description && <p className="cc-note">{c.description}</p>}
        {c.meetingUrl && (
          <a className="meet-link" href={c.meetingUrl} target="_blank" rel="noreferrer"><Icon name="video" color="#005bbf" /> Join video meeting</a>
        )}
        <div className="cc-actions" role="group" aria-label={`Answer for ${c.title}`}>
          <button type="button" className="btn-accept" aria-pressed={status === 'accepted'} disabled={busyId === c.id} onClick={() => answer(c, 'accepted')}>Accept</button>
          <button type="button" className="btn-decline" aria-pressed={status === 'declined'} disabled={busyId === c.id} onClick={() => answer(c, 'declined')}>Decline</button>
        </div>
      </article>
    );
  };

  const group = (list: CalendarEvent[]) => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const c of list) { const k = dayHeading(c.start); byDay.set(k, [...(byDay.get(k) ?? []), c]); }
    return [...byDay.entries()].map(([day, items]) => (
      <div key={day} className="day-group">
        <h3 className="day-h">{day}</h3>
        {items.map(card)}
      </div>
    ));
  };

  return (
    <div className="shell">
      <header className="utility">
        <div className="u-row">
          <div className="sync-pill">
            <span className="dot on" />
            <span className="sync-label">My classes</span>
            <span className="sync-meta">• {upcoming.length} upcoming{needsAnswer.length ? ` · ${needsAnswer.length} to answer` : ''}</span>
          </div>
          <UserMenu me={me} />
        </div>
      </header>
      <div className="work">
        <section className="gridwrap">
          <CalendarToolbar title={title} view={view} tz={tz} onNav={nav} onView={(v) => cal.current?.getApi().changeView(v)} />
          <div className="fcbox">
            <div className="fchost">
              <FullCalendar
                ref={cal}
                plugins={PLUGINS}
                initialView="timeGridWeek"
                headerToolbar={false}
                height="100%"
                allDaySlot={false}
                nowIndicator
                selectable={false}
                editable={false}
                slotDuration="00:30:00"
                slotLabelInterval="01:00"
                slotLabelContent={slotLabel}
                scrollTime="08:00:00"
                eventOverlap
                dayHeaderContent={dayHeader}
                eventContent={eventContent}
                eventClassNames={(a) => {
                  const ev = a.event.extendedProps.ev as CalendarEvent | undefined;
                  return ev ? [`cat-${ev.category}`, `my-${ev.myStatus ?? 'invited'}`] : [];
                }}
                events={eventSource}
                datesSet={onDates}
                eventClick={(a: EventClickArg) => select((a.event.extendedProps.ev as CalendarEvent).id)}
              />
            </div>
          </div>
        </section>
        <aside className="drawer classes-panel" aria-label="My classes">
          <div className="d-head">
            <div className="d-head-l">
              <span className="d-icon"><Icon name="tutoring" color="#005bbf" /></span>
              <div>
                <h3>My classes</h3>
                <p>Accept or decline your invitations</p>
              </div>
            </div>
          </div>
          <div className="d-body">
            {error && <p className="err" role="alert">{error}</p>}
            {classes === null && <p className="muted-line">Loading your classes…</p>}
            {classes !== null && upcoming.length === 0 && !error && (
              <p className="muted-line" data-testid="no-classes">No upcoming classes. When a teacher invites you, it will show up here and in your email.</p>
            )}
            {needsAnswer.length > 0 && (
              <section aria-label="Needs your answer">
                <h2 className="sec-h">Needs your answer</h2>
                {group(needsAnswer)}
              </section>
            )}
            {answered.length > 0 && (
              <section aria-label="Upcoming">
                <h2 className="sec-h">Upcoming</h2>
                {group(answered)}
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
