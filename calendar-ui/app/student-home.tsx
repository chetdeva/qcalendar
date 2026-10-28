'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core';
import type { CalendarEvent, Me } from '@/lib/calendar';
import { STATUS_LABEL } from '@/lib/format';
import { api } from './api-client';
import { CalendarToolbar, type ViewType } from './components/calendar-toolbar';
import { ClassesPanel, fetchUpcoming, upcomingOf } from './components/classes-panel';
import { InviteActions } from './components/invite-actions';
import { dayHeader, makeEventContent } from './components/event-content';
import { AppHeader } from '@components/app-header';
import { RoleBanner } from './components/role-banner';
import { StudentNudge } from '@components/student-nudge';

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
  // Free class: the student picks a slot on this calendar; a teacher confirms it later.
  const [picking, setPicking] = useState(false);
  const [slot, setSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [request, setRequest] = useState<{ start: string; end: string } | null>(null);
  const [nudgeKey, setNudgeKey] = useState(0);

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

  const loadRequest = useCallback(() => {
    api<{ request: { start: string | null; end: string | null } | null }>('/api/trial-requests/mine').then(
      (r) => setRequest(r.request?.start && r.request.end ? { start: r.request.start, end: r.request.end } : null),
      () => setRequest(null),
    );
  }, []);
  useEffect(() => { loadRequest(); }, [loadRequest, nudgeKey]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('pick') === '1') setPicking(true); }, []); // the dashboard card links here

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
  const eventContent = useMemo(() => {
    const base = makeEventContent({ showTeacher: true, showStudents: false });
    return (arg: EventContentArg) => (arg.event.extendedProps.ev ? base(arg) : <div className="tent">{arg.event.title}</div>);
  }, []);
  const sources = useMemo(
    () => [
      eventSource,
      ...(request ? [[{ id: 'free-class-request', title: 'Free trial class (requested)', start: request.start, end: request.end, editable: false }]] : []),
      ...(slot ? [[{ id: 'pending-slot', start: slot.start, end: slot.end, display: 'background' as const, classNames: ['pending-slot'] }]] : []),
    ],
    [eventSource, request, slot],
  );
  const onPick = (info: DateSelectArg) => {
    if (info.allDay) return;
    const start = info.start;
    const end = new Date(start.getTime() + 30 * 60_000); // the trial class is 30 minutes, whatever was dragged
    setSlot({ start, end });
    cal.current?.getApi().unselect(); // FullCalendar's own selection stays out of the way so another slot can be picked; the chosen one is drawn below
  };
  async function sendRequest() {
    if (!slot) return;
    setError('');
    try {
      await api('/api/trial-requests', { method: 'POST', body: JSON.stringify({ start: slot.start.toISOString() }) });
      setPicking(false);
      setSlot(null);
      cal.current?.getApi().unselect();
      setNudgeKey((k) => k + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const stopPicking = () => { setPicking(false); setSlot(null); cal.current?.getApi().unselect(); };

  const upcoming = upcomingOf(classes);
  const needsAnswer = upcoming.filter((c) => c.myStatus === 'invited');
  const answered = upcoming.filter((c) => c.myStatus !== 'invited');

  /** Runs one request for a class, swaps the updated class into the list and refreshes the grid. */
  async function update(c: CalendarEvent, run: () => Promise<CalendarEvent>) {
    setBusyId(c.id);
    setError('');
    try {
      const updated = await run();
      setClasses((list) => (list ?? []).map((x) => (x.id === c.id ? updated : x)));
      refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }
  const answer = (c: CalendarEvent, response: 'accepted' | 'declined', note?: string) =>
    update(c, () => api<CalendarEvent>(`/api/events/${c.id}/respond`, { method: 'POST', body: JSON.stringify({ response, note }) }));
  const requestChange = (c: CalendarEvent, start: string, note?: string) =>
    update(c, () => api<CalendarEvent>(`/api/events/${c.id}/change-requests`, { method: 'POST', body: JSON.stringify({ start, note }) }));

  const nav = (a: 'prev' | 'next' | 'today') => {
    const c = cal.current?.getApi();
    if (a === 'prev') c?.prev();
    else if (a === 'next') c?.next();
    else c?.today();
  };

  return (
    <div className="shell">
      <AppHeader current="calendar" name={me.full_name || me.email} role={me.role} avatar={me.avatar_updated_at} afterBrand={<StudentNudge onPickTime={() => setPicking(true)} reloadKey={nudgeKey} />} />
      {staleRole && <RoleBanner me={me} />}
      <header className="utility">
        <div className="u-row">
          <div className="sync-pill">
            <span className="dot on" />
            <span className="sync-label">My classes</span>
            <span className="sync-meta">• {upcoming.length} upcoming{needsAnswer.length ? ` · ${needsAnswer.length} to answer` : ''}</span>
          </div>
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
                selectable={picking}
                selectMirror
                snapDuration="00:15:00"
                selectAllow={(s) => s.start.getTime() > Date.now()}
                select={onPick}
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
                eventSources={sources}
                datesSet={onDates}
                eventClick={(a: EventClickArg) => { const ev = a.event.extendedProps.ev as CalendarEvent | undefined; if (ev) setSelected(ev.id); }}
              />
            </div>
          </div>
        </section>
        <div className="side">
        {picking && (
          <section className="freereq" aria-label="Request your free trial class">
            <h3>Request your free trial class</h3>
            {slot ? (
              <>
                <p>Request {slot.start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} for your free trial class?</p>
                <div className="freereq-btns"><button type="button" onClick={sendRequest}>Send request</button><button type="button" className="alt" onClick={stopPicking}>Cancel</button></div>
              </>
            ) : (
              <>
                <p>Pick a day and time: click or drag on the calendar.</p>
                <div className="freereq-btns"><button type="button" className="alt" onClick={stopPicking}>Cancel</button></div>
              </>
            )}
          </section>
        )}
        <ClassesPanel
          subtitle="Accept, decline or ask for another time"
          empty="No upcoming classes. When a teacher invites you, it will show up here and in your email."
          classes={classes}
          error={error}
          sections={[{ label: 'Needs your answer', items: needsAnswer }, { label: 'Upcoming', items: answered }]}
          selected={selected}
          onSelect={(c) => setSelected(c.id)}
          who={(c) => `With ${c.ownerName ?? 'your teacher'}${c.participantCount > 1 ? ` · ${c.participantCount} students` : ''}`}
          badge={(c) => { const st = c.myStatus ?? 'invited'; return <span className={`status status-${st}`}>{STATUS_LABEL[st]}</span>; }}
          actions={(c) => <InviteActions c={c} busy={busyId === c.id} onAnswer={answer} onRequest={requestChange} />}
        />
        </div>
      </div>
    </div>
  );
}
