'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import type { CalendarEvent, CalendarSettings, Me, Participant, Person, Student } from '@/lib/calendar';
import { answerSummary, capacityHours, hm, hoursByCategory, mergeSlots, minutesBetween, rangeLabel, ymd } from '@/lib/format';
import { api, ApiError } from './api-client';
import { TopBar } from './components/top-bar';
import { CalendarToolbar, type ViewType } from './components/calendar-toolbar';
import { AdminViewing, type Viewing } from './components/admin-viewing';
import { ChangeRequestBox } from './components/change-request-box';
import { ClassesPanel, fetchUpcoming, upcomingOf } from './components/classes-panel';
import { conflictMessage, CreateDrawer, DetailsDrawer, type Conflict, type LessonForm } from './components/lesson-drawer';
import { dayHeader, makeEventContent } from './components/event-content';
import { DialogFrame } from './components/dialog-frame';
import { WebsiteLeads } from './components/website-leads';
import { FreeClassRequests, type TrialRequestRow } from './components/free-class-requests';
import { RoleBanner } from './components/role-banner';
import { AppHeader } from '@components/app-header';

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const slotLabel = (a: { date: Date }) => a.date.toLocaleTimeString('en-US', { hour: 'numeric' });

const blankForm = (): LessonForm => ({ title: '', date: ymd(new Date()), time: '10:00', duration: 60, students: [], meet: true, category: 'tutoring', teacher: null });

const toConflict = (e: ApiError): Conflict | null =>
  e.code === 'conflict' ? { kind: 'owner', people: [] }
  : e.code === 'outside_availability' ? { kind: 'hours', people: [] }
  : e.code === 'participant_conflict' ? { kind: 'students', people: Array.isArray(e.details) ? (e.details as string[]) : [] }
  : null;

const participantsOut = (list: Student[]) => list.map((s) => ({ email: s.email, name: s.name, userId: s.userId }));

/** The full calendar for teachers (their own classes) and admins (every class). */
export default function TeacherCalendar({ me, staleRole = false }: { me: Me; staleRole?: boolean }) {
  const admin = me.role === 'admin';
  const role = admin ? 'admin' : 'teacher';
  const cal = useRef<FullCalendar>(null);
  const [view, setView] = useState<ViewType>('timeGridWeek');
  const [title, setTitle] = useState('');
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [teachers, setTeachers] = useState<Person[]>([]);
  // The right-hand side shows "My classes" by default, or the details of one class. "New lesson" opens over it.
  const [panel, setPanel] = useState<'details' | null>(null);
  const [creating, setCreating] = useState(false);
  const [classes, setClasses] = useState<CalendarEvent[] | null>(null);
  const [picked, setPicked] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<LessonForm>(blankForm);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const clickRect = useRef<DOMRect | null>(null); // the class that was clicked, so its dialog opens beside it
  const clickedSlot = useRef(false); // the form was opened by clicking or dragging on the calendar, so it opens beside that slot (Quick Add and Change time use the corner)
  const [showFree, setShowFree] = useState(true);
  const [tz, setTz] = useState('');
  const [viewing, setViewing] = useState<Viewing>({ kind: 'all' }); // admins: whose classes the calendar shows

  const loadList = useCallback(() => {
    fetchUpcoming().then(setClasses, (e) => { setError((e as Error).message); setClasses([]); });
  }, []);
  const refetch = () => { cal.current?.getApi().refetchEvents(); loadList(); };

  useEffect(() => {
    if (admin) api<{ teachers: Person[] }>('/api/teachers').then((r) => setTeachers(r.teachers), () => {});
    else api<CalendarSettings>('/api/settings').then(setSettings, () => {});
    setTz(new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '');
    loadList();
  }, [admin, loadList]);

  // Opened from the admin portal ("View calendar"): ?teacher=<id> or ?student=<email>.
  const fromLink = useRef(false);
  useEffect(() => {
    if (!admin || fromLink.current) return;
    const sp = new URLSearchParams(window.location.search);
    const email = sp.get('student');
    if (email) { fromLink.current = true; setViewing({ kind: 'student', students: [{ email, name: sp.get('name') }] }); return; }
    const id = sp.get('teacher');
    const t = id && teachers.find((x) => x.id === id);
    if (t) { fromLink.current = true; setViewing({ kind: 'teacher', teacher: t }); }
  }, [admin, teachers]);

  // Changing who is being viewed reloads the calendar; looking at a teacher also makes them the teacher for new classes.
  useEffect(() => {
    if (!admin) return;
    if (viewing.kind === 'teacher') setForm((f) => ({ ...f, teacher: viewing.teacher }));
    setTimeout(refetch, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, viewing]);

  // Scheduling for a student who has an assigned teacher: start from that teacher (the admin can still change it).
  const firstStudentId = form.students[0]?.userId;
  useEffect(() => {
    if (!admin || form.teacher || !firstStudentId) return;
    void api<{ teacherId: string | null }>(`/api/students/${firstStudentId}/teacher`).then((r) => {
      const t = teachers.find((x) => x.id === r.teacherId);
      if (t) setForm((f) => (f.teacher ? f : { ...f, teacher: t }));
    }, () => {});
  }, [admin, form.teacher, firstStudentId, teachers]);

  // The loader reads these through refs so its identity never changes; a new function would make
  // FullCalendar treat it as a new event source and refetch on every keystroke or click.
  const showFreeRef = useRef(showFree);
  const durationRef = useRef(form.duration);
  const teacherRef = useRef(form.teacher?.id);
  showFreeRef.current = showFree;
  durationRef.current = form.duration;
  teacherRef.current = form.teacher?.id;

  const viewingRef = useRef(viewing);
  viewingRef.current = viewing;
  const adminRef = useRef(admin);
  const meIdRef = useRef(me.id);
  const loadEvents = useCallback(async (info: { start: Date; end: Date }): Promise<EventInput[]> => {
    const qs = `from=${encodeURIComponent(info.start.toISOString())}&to=${encodeURIComponent(info.end.toISOString())}`;
    const v = viewingRef.current;
    const filter = v.kind === 'teacher' ? `&ownerId=${v.teacher.id}` : v.kind === 'student' && v.students.length ? `&participant=${encodeURIComponent(v.students.map((x) => x.email).join(','))}` : '';
    try {
      const { events: list } = await api<{ events: CalendarEvent[] }>(`/api/events?${qs}${filter}`);
      setEvents(list);
      const mine = (e: CalendarEvent) => adminRef.current || e.ownerId === meIdRef.current;
      const items: EventInput[] = list.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, extendedProps: { ev: e }, editable: mine(e) }));
      const shadeFor = adminRef.current ? teacherRef.current : 'self';
      if (showFreeRef.current && shadeFor) {
        const who = adminRef.current ? `&teacherId=${teacherRef.current}` : '';
        const a = await api<{ slots: { start: string; end: string }[] }>(`/api/availability?${qs}&duration=${durationRef.current}${who}`);
        for (const r of mergeSlots(a.slots)) items.push({ start: r.start, end: r.end, display: 'background', classNames: ['free'] });
      }
      setError('');
      return items;
    } catch (e) {
      setError((e as Error).message);
      return [];
    }
  }, []);

  const eventSource = useCallback(
    (info: { start: Date; end: Date }, ok: (e: EventInput[]) => void, fail: (e: Error) => void) => {
      loadEvents(info).then(ok, fail);
    },
    [loadEvents],
  );

  const onDates = useCallback((a: DatesSetArg) => {
    setTitle(a.view.title);
    setView(a.view.type as ViewType);
    setRange({ start: a.start, end: a.end });
  }, []);

  const eventContent = useMemo(() => {
    const base = makeEventContent({ showTeacher: admin });
    return (arg: EventContentArg) => {
      if (arg.event.extendedProps.ev) return base(arg);
      if (arg.event.id === 'new-lesson') { // the slot being booked names its time window, like Google Calendar
        const [s, e] = [arg.event.start, arg.event.end];
        return s && e ? <div className="pending-time"><b>(No title)</b><span>{rangeLabel(s.toISOString(), e.toISOString())}</span></div> : null;
      }
      return <div className="tent">{arg.event.title}</div>;
    };
  }, [admin]);

  // Free trial class requests: listed in the side panel and drawn as dashed slots so clashes with the calendar are easy to see.
  const [requests, setRequests] = useState<TrialRequestRow[]>([]);
  useEffect(() => {
    api<{ requests: TrialRequestRow[] }>('/api/trial-requests').then((r) => setRequests(r.requests), () => setRequests([]));
  }, [classes]);
  const sources = useMemo(
    () => [eventSource, requests.filter((r) => r.start && r.end).map((r) => ({ id: `trial-request-${r.id}`, title: `Trial: ${r.studentName ?? r.studentEmail ?? 'student'}`, start: r.start!, end: r.end!, editable: false }))],
    [eventSource, requests],
  );

  const stats = useMemo(() => {
    const live = events.filter((e) => e.status === 'confirmed');
    const byCategory = hoursByCategory(live);
    const booked = byCategory.tutoring + byCategory.office_hours + byCategory.personal + byCategory.trial;
    return { sessions: live.length, byCategory, booked, capacity: admin ? null : range ? capacityHours(settings, range.start, range.end) : 0 };
  }, [events, settings, range, admin]);

  const missing: string[] = [];
  if (admin && !form.teacher) missing.push('a teacher');
  if (!form.title.trim()) missing.push('a title');
  if (!form.date) missing.push('a date');
  if (!form.time) missing.push('a start time');
  if ((form.category === 'tutoring' || form.category === 'trial') && form.students.length === 0) missing.push('at least one student');

  const openCreate = () => {
    clickedSlot.current = false;
    setCreating(true);
    setError('');
    setConflict(null);
  };

  const dragged = (info: DateSelectArg, d: Date) => info.end.getTime() - d.getTime() > 15 * 60_000;

  function onSelect(info: DateSelectArg) {
    openCreate();
    clickedSlot.current = true;
    const d = info.start;
    if (info.allDay) setForm((f) => ({ ...f, date: ymd(d) }));
    else setForm((f) => ({ ...f, date: ymd(d), time: hm(d), duration: f.category === 'trial' ? 30 : dragged(info, d) ? Math.max(5, Math.round((info.end.getTime() - d.getTime()) / 60000)) : f.duration })); // a trial class is always 30 minutes; a plain click (one snap step) keeps the form's length
    cal.current?.getApi().unselect(); // the placeholder is drawn from the form below, so changing the duration there moves it
  }

  // The slot being booked: drawn from the form, so it follows the date, start time and duration as they are changed.
  useEffect(() => {
    const api = cal.current?.getApi();
    if (!api) return;
    api.getEventById('new-lesson')?.remove();
    const start = form.date && form.time ? new Date(`${form.date}T${form.time}`) : null;
    if (creating && start && !Number.isNaN(start.getTime())) {
      api.addEvent({ id: 'new-lesson', start, end: new Date(start.getTime() + form.duration * 60_000), classNames: ['pending-slot'], editable: true, durationEditable: form.category !== 'trial' }); // drag to another time, resize to change the length (a trial stays 30 minutes)
    }
  }, [creating, form.date, form.time, form.duration, form.category]);

  async function move(info: EventDropArg | EventResizeDoneArg) {
    if (info.event.id === 'new-lesson') { // the slot being booked: the form follows it
      const s = info.event.start!;
      const e = info.event.end;
      setForm((f) => ({ ...f, date: ymd(s), time: hm(s), duration: f.category === 'trial' || !e ? f.duration : Math.max(5, Math.round((e.getTime() - s.getTime()) / 60000)) }));
      return;
    }
    const ev = info.event.extendedProps.ev as CalendarEvent;
    const start = info.event.start!;
    const end = info.event.end ?? new Date(start.getTime() + minutesBetween(ev.start, ev.end) * 60000);
    const patch = (force: boolean) =>
      api(`/api/events/${ev.id}`, { method: 'PATCH', body: JSON.stringify({ start: start.toISOString(), end: end.toISOString(), force }) });
    try {
      await patch(false);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && confirm('That time overlaps another class, or a student\'s other class. Move it anyway?')) {
        try {
          await patch(true);
        } catch (e2) {
          setError((e2 as Error).message);
          info.revert();
        }
      } else {
        if (err.status !== 409) setError(err.message);
        info.revert();
      }
    }
    refetch();
    setPicked((cur) => (cur && cur.id === ev.id ? null : cur));
    setPanel((p) => (p === 'details' ? null : p));
  }

  async function create(force = false) {
    if (missing.length) return;
    setBusy(true);
    setError('');
    setConflict(null);
    try {
      await api('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          start: new Date(`${form.date}T${form.time}`).toISOString(),
          durationMinutes: form.category === 'trial' ? 30 : form.duration,
          participants: participantsOut(form.students),
          meet: form.meet,
          category: form.category,
          force,
          ...(admin && form.teacher ? { ownerId: form.teacher.id, ownerEmail: form.teacher.email, ownerName: form.teacher.name ?? undefined } : {}),
        }),
      });
      setForm({ ...form, title: '', students: [] });
      setCreating(false);
      cal.current?.getApi().unselect();
      refetch();
    } catch (e) {
      const err = e as ApiError;
      const c = toConflict(err);
      setConflict(c);
      setError(c ? conflictMessage({ ...c, people: c.people }) : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addStudents(students: Student[], force: boolean) {
    if (!picked) return false;
    setBusy(true);
    setError('');
    setConflict(null);
    try {
      const updated = await api<CalendarEvent>(`/api/events/${picked.id}/participants`, { method: 'POST', body: JSON.stringify({ participants: participantsOut(students), force }) });
      setPicked(updated);
      refetch();
      return true;
    } catch (e) {
      const err = e as ApiError;
      const c = toConflict(err);
      setConflict(c);
      setError(c ? conflictMessage(c) : err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(patch: { title: string; start: string; durationMinutes: number }, force: boolean) {
    if (!picked) return false;
    setBusy(true);
    setError('');
    setConflict(null);
    try {
      await api<CalendarEvent>(`/api/events/${picked.id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, force }) });
      refetch();
      setPanel(null); // saved: the dialog closes
      return true;
    } catch (e) {
      const err = e as ApiError;
      const c = toConflict(err);
      setConflict(c);
      setError(c ? conflictMessage(c) : err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(p: Participant) {
    if (!picked) return;
    setError('');
    try {
      setPicked(await api<CalendarEvent>(`/api/events/${picked.id}/participants/${p.id}`, { method: 'DELETE' }));
      refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Approve (moves the class) or reject a student's time-change request. A busy teacher gets the service's own conflict message. */
  async function decide(ev: CalendarEvent, requestId: string, decision: 'approve' | 'reject') {
    setBusy(true);
    try {
      const updated = await api<CalendarEvent>(`/api/events/${ev.id}/change-requests/${requestId}/${decision}`, { method: 'POST' });
      setPicked((p) => (p?.id === ev.id ? updated : p));
      setError('');
      refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm('Cancel this class and notify the students?')) return;
    try {
      await api(`/api/events/${id}`, { method: 'DELETE' });
      setPicked(null);
      setPanel(null);
      setError('');
      refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const open = (c: CalendarEvent, at?: DOMRect) => {
    clickRect.current = at ?? null;
    setPicked(c);
    setPanel('details');
    setCreating(false);
    setError('');
    setConflict(null);
  };

  const whoLine = (c: CalendarEvent) => {
    const n = c.participants.length;
    return [admin && (c.ownerName ?? c.ownerEmail ?? 'Teacher'), n === 0 ? 'No students yet' : `${n} ${n === 1 ? 'student' : 'students'}`, answerSummary(c.participants)].filter(Boolean).join(' · ');
  };

  const needsAttention = (c: CalendarEvent) =>
    c.changeRequest?.status === 'pending' ? <span className="status status-invited">Time change requested</span>
      : c.participants.some((p) => p.status === 'declined') ? <span className="status status-declined">Declined</span> : null;

  const nav = (a: 'prev' | 'next' | 'today') => {
    const c = cal.current?.getApi();
    if (a === 'prev') c?.prev();
    else if (a === 'next') c?.next();
    else c?.today();
  };

  return (
    <div className="shell">
      <AppHeader current="calendar" name={me.full_name || me.email} role={me.role} avatar={me.avatar_updated_at} />
      {staleRole && <RoleBanner me={me} />}
      <TopBar
        me={me}
        sessions={stats.sessions}
        bookedHours={stats.booked}
        capacityHours={stats.capacity}
        byCategory={stats.byCategory}
        view={view}
        showFree={showFree}
        canShade={!admin || Boolean(form.teacher)}
        onShowFree={(v) => { setShowFree(v); setTimeout(refetch, 0); }}
        onQuickAdd={openCreate}
        extra={admin ? <AdminViewing teachers={teachers} value={viewing} onApply={setViewing} /> : undefined}
      />
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
                selectable
                selectMirror
                editable
                eventDurationEditable
                slotDuration="01:00:00"
                snapDuration="00:15:00"
                slotLabelContent={slotLabel}
                scrollTime="08:00:00"
                eventOverlap
                dayHeaderContent={dayHeader}
                eventContent={eventContent}
                eventClassNames={(a) => (a.event.extendedProps.ev ? [`cat-${(a.event.extendedProps.ev as CalendarEvent).category}`] : [])}
                eventSources={sources}
                datesSet={onDates}
                select={onSelect}
                eventClick={(a: EventClickArg) => { const ev = a.event.extendedProps.ev as CalendarEvent | undefined; if (ev) open(ev, a.el.getBoundingClientRect()); }}
                eventDrop={move}
                eventResize={move}
              />
            </div>
          </div>
        </section>
        <div className="side">
          {admin && <WebsiteLeads />}
          <FreeClassRequests
            requests={requests}
            canConfirm={!admin}
            onConfirmed={refetch}
            onChangeTime={(student, start) => {
              openCreate();
              if (start) { // show the requested slot, an hour of context above it
                const api = cal.current?.getApi();
                api?.gotoDate(start);
                api?.scrollToTime(`${String(Math.max(start.getHours() - 1, 0)).padStart(2, '0')}:00:00`);
              }
              setForm((f) => ({ ...f, title: 'Free trial class', category: 'trial', duration: 30, students: [student], ...(start ? { date: ymd(start), time: hm(start) } : {}) }));
            }}
          />
          <ClassesPanel
            subtitle={admin ? 'Every teacher’s scheduled classes' : 'Your scheduled classes'}
            empty="No upcoming classes. Use Quick Add Lesson, or drag across the calendar, to schedule one."
            classes={classes}
            error={creating || panel === 'details' ? '' : error}
            sections={[{ label: 'Upcoming', items: upcomingOf(classes) }]}
            selected={picked?.id ?? null}
            onSelect={(c) => open(c)}
            who={whoLine}
            badge={needsAttention}
            actions={(c) => <ChangeRequestBox ev={c} busy={busy} onDecide={decide} />}
          />
        </div>
      </div>
      {(creating || (panel === 'details' && picked)) && (
        <div className="modal">
          <DialogFrame key={creating ? 'new' : picked?.id} anchor={clickRect.current} slot={creating && clickedSlot.current}>
          {creating ? (
            <CreateDrawer
              form={form}
              setForm={(f) => { if (f.teacher?.id !== form.teacher?.id) setTimeout(refetch, 0); setForm(f); }}
              role={role}
              teachers={teachers}
              missing={missing}
              busy={busy}
              error={error}
              conflict={conflict}
              onCreate={create}
              onClose={() => setCreating(false)}
            />
          ) : picked && (
            <DetailsDrawer
              key={picked.id}
              ev={picked}
              role={role}
              error={error}
              conflict={conflict}
              busy={busy}
              onCancel={() => cancel(picked.id)}
              onNew={openCreate}
              onClose={() => setPanel(null)}
              onAdd={addStudents}
              onRemove={removeStudent}
              onDecide={decide}
              onSave={saveEdit}
            />
          )}
          </DialogFrame>
        </div>
      )}
    </div>
  );
}
