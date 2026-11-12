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
import { MyClassRequests } from './components/my-class-requests';
import type { ClassRequestRow } from './components/class-requests';

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
  // A class with one mentor (from the dashboard's "Request a class"): the mentor is named in the address, the time is picked here.
  const [mentor, setMentor] = useState<{ id: string; name: string } | null>(null);
  const [classReqs, setClassReqs] = useState<ClassRequestRow[]>([]);
  const [pickError, setPickError] = useState('');
  // "Request a class" on this page (instead of from the dashboard): choose the mentor here, then the time.
  const [chooser, setChooser] = useState(false);
  const [mentorList, setMentorList] = useState<{ id: string; name: string }[] | null>(null);
  const [mentorsError, setMentorsError] = useState('');
  function startClassRequest() {
    setChooser(true); setPicking(true); setSlot(null); setPickError('');
    if (mentorList) return;
    api<{ mentors: { id: string; name: string }[] }>('/api/mentors').then(
      (r) => setMentorList(r.mentors.map((m) => ({ id: m.id, name: m.name }))),
      (e) => { setMentorList([]); setMentorsError((e as Error).message); },
    );
  }
  const loadClassReqs = useCallback(() => {
    api<{ requests: ClassRequestRow[] }>('/api/class-requests/mine').then((r) => setClassReqs(r.requests), () => setClassReqs([]));
  }, []);
  useEffect(() => { loadClassReqs(); }, [loadClassReqs]);

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
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('pick') === '1') setPicking(true); // the dashboard card links here
    const id = q.get('mentor');
    if (id && /^[0-9a-f-]{36}$/i.test(id)) { setMentor({ id, name: q.get('name')?.slice(0, 80) || 'your mentor' }); setPicking(true); }
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
  const eventContent = useMemo(() => {
    const base = makeEventContent({ showTeacher: true, showStudents: false });
    return (arg: EventContentArg) => (arg.event.extendedProps.ev ? base(arg) : <div className="tent">{arg.event.title}</div>);
  }, []);
  const sources = useMemo(
    () => [
      eventSource,
      ...(request ? [[{ id: 'free-class-request', title: 'Free trial class (requested)', start: request.start, end: request.end, editable: false }]] : []),
      ...(classReqs.some((r) => r.status === 'requested') ? [classReqs.filter((r) => r.status === 'requested').map((r) => ({ id: `class-request-${r.id}`, title: `Requested: ${r.teacher.name ?? 'mentor'}`, start: r.start, end: r.end, editable: false }))] : []),
      ...(slot ? [[{ id: 'pending-slot', start: slot.start, end: slot.end, display: 'background' as const, classNames: ['pending-slot'] }]] : []),
    ],
    [eventSource, request, slot, classReqs],
  );
  const onPick = (info: DateSelectArg) => {
    if (info.allDay) return;
    const start = info.start;
    const end = new Date(start.getTime() + (mentor ? 60 : 30) * 60_000); // the trial class is 30 minutes and a mentor's class an hour, whatever was dragged
    setSlot({ start, end });
    cal.current?.getApi().unselect(); // FullCalendar's own selection stays out of the way so another slot can be picked; the chosen one is drawn below
  };
  async function sendRequest() {
    if (!slot) return;
    setError('');
    setPickError('');
    try {
      if (mentor) await api('/api/class-requests', { method: 'POST', body: JSON.stringify({ teacherId: mentor.id, start: slot.start.toISOString() }) });
      else await api('/api/trial-requests', { method: 'POST', body: JSON.stringify({ start: slot.start.toISOString() }) });
      stopPicking();
      loadClassReqs();
      setNudgeKey((k) => k + 1);
    } catch (e) {
      (mentor ? setPickError : setError)((e as Error).message);
    }
  }
  const stopPicking = () => {
    setPicking(false); setSlot(null); setMentor(null); setChooser(false); setPickError('');
    cal.current?.getApi().unselect();
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
  };

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
          <button type="button" className="req-class" onClick={startClassRequest}>Request a class</button>
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
                selectable={picking && (!chooser || Boolean(mentor))}
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
          <section className="freereq" aria-label={mentor ? `Request a class with ${mentor.name}` : chooser ? 'Request a class' : 'Request your free trial class'}>
            <h3>{mentor ? `Request a class with ${mentor.name}` : chooser ? 'Request a class' : 'Request your free trial class'}</h3>
            {chooser && (
              <label className="mentor-pick">Mentor
                <select value={mentor?.id ?? ''} disabled={!mentorList} onChange={(e) => { const m = mentorList?.find((x) => x.id === e.target.value); setMentor(m ?? null); setSlot(null); }}>
                  <option value="">{mentorList ? 'Choose a mentor' : 'Loading mentors…'}</option>
                  {mentorList?.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
            )}
            {mentorsError && <p role="alert" className="freereq-err">{mentorsError}</p>}
            {mentorList && mentorList.length === 0 && !mentorsError && <p>No mentors have published a profile yet.</p>}
            {pickError && <p role="alert" className="freereq-err">{pickError}{/plan/i.test(pickError) && <> <a href={`${process.env.NEXT_PUBLIC_USERS_UI_URL ?? ''}/billing`}>Choose a plan</a></>}</p>}
            {chooser && !mentor ? (
              <div className="freereq-btns"><button type="button" className="alt" onClick={stopPicking}>Cancel</button></div>
            ) : slot ? (
              <>
                <p>Request {slot.start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} {mentor ? `with ${mentor.name}` : 'for your free trial class'}?</p>
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
        <MyClassRequests requests={classReqs} onChanged={loadClassReqs} />
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
