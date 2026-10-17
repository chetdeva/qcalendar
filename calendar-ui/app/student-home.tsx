'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core';
import type { CalendarEvent, Me } from '@/lib/calendar';
import { STATUS_LABEL } from '@/lib/format';
import { api } from './api-client';
import { CalendarToolbar, type ViewType } from './components/calendar-toolbar';
import { ClassesPanel, fetchUpcoming, upcomingOf } from './components/classes-panel';
import { dayHeader, makeEventContent } from './components/event-content';
import { UserMenu } from './components/user-menu';
import { RoleBanner } from './components/role-banner';

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const slotLabel = (a: { date: Date }) => a.date.toLocaleTimeString('en-US', { hour: 'numeric' });

/** A student's view: their own classes to accept or decline, and a read-only calendar. They cannot create or change anything. */
export default function StudentHome({ me, staleRole = false }: { me: Me; staleRole?: boolean }) {
  const cal = useRef<FullCalendar>(null);
  const [view, setView] = useState<ViewType>('timeGridWeek');
  const [title, setTitle] = useState('');
  const [tz, setTz] = useState('');
  const [classes, setClasses] = useState<CalendarEvent[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refetch = () => cal.current?.getApi().refetchEvents();

  const loadList = useCallback(async () => {
    try {
      setClasses(await fetchUpcoming());
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

  const upcoming = upcomingOf(classes);
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

  const nav = (a: 'prev' | 'next' | 'today') => {
    const c = cal.current?.getApi();
    if (a === 'prev') c?.prev();
    else if (a === 'next') c?.next();
    else c?.today();
  };

  const actions = (c: CalendarEvent) => {
    const status = c.myStatus ?? 'invited';
    return (
      <div className="cc-actions" role="group" aria-label={`Answer for ${c.title}`}>
        <button type="button" className="btn-accept" aria-pressed={status === 'accepted'} disabled={busyId === c.id} onClick={() => answer(c, 'accepted')}>Accept</button>
        <button type="button" className="btn-decline" aria-pressed={status === 'declined'} disabled={busyId === c.id} onClick={() => answer(c, 'declined')}>Decline</button>
      </div>
    );
  };

  return (
    <div className="shell">
      {staleRole && <RoleBanner me={me} />}
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
                slotDuration="01:00:00"
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
                eventClick={(a: EventClickArg) => setSelected((a.event.extendedProps.ev as CalendarEvent).id)}
              />
            </div>
          </div>
        </section>
        <ClassesPanel
          subtitle="Accept or decline your invitations"
          empty="No upcoming classes. When a teacher invites you, it will show up here and in your email."
          classes={classes}
          error={error}
          sections={[{ label: 'Needs your answer', items: needsAnswer }, { label: 'Upcoming', items: answered }]}
          selected={selected}
          onSelect={(c) => setSelected(c.id)}
          who={(c) => `With ${c.ownerName ?? 'your teacher'}${c.participantCount > 1 ? ` · ${c.participantCount} students` : ''}`}
          badge={(c) => { const st = c.myStatus ?? 'invited'; return <span className={`status status-${st}`}>{STATUS_LABEL[st]}</span>; }}
          actions={actions}
        />
      </div>
    </div>
  );
}
