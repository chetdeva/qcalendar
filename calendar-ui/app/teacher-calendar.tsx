'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import type { CalendarEvent, CalendarSettings, Me, Participant, Person, Student } from '@/lib/calendar';
import { capacityHours, hm, hoursByCategory, mergeSlots, minutesBetween, ymd } from '@/lib/format';
import { api, ApiError } from './api-client';
import { TopBar } from './components/top-bar';
import { CalendarToolbar, type ViewType } from './components/calendar-toolbar';
import { conflictMessage, CreateDrawer, DetailsDrawer, type Conflict, type LessonForm } from './components/lesson-drawer';
import { dayHeader, makeEventContent } from './components/event-content';
import { RoleBanner } from './components/role-banner';

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const slotLabel = (a: { date: Date }) => a.date.toLocaleTimeString('en-US', { hour: 'numeric' });

const blankForm = (): LessonForm => ({ title: '', date: ymd(new Date()), time: '10:00', duration: 60, students: [], meet: true, category: 'tutoring', teacher: null });

const toConflict = (e: ApiError): Conflict | null =>
  e.code === 'conflict' ? { kind: 'owner', people: [] }
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
  const [panel, setPanel] = useState<'create' | 'details' | null>('create');
  const [picked, setPicked] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<LessonForm>(blankForm);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [showFree, setShowFree] = useState(true);
  const [tz, setTz] = useState('');

  const refetch = () => cal.current?.getApi().refetchEvents();

  useEffect(() => {
    if (admin) api<{ teachers: Person[] }>('/api/teachers').then((r) => setTeachers(r.teachers), () => {});
    else api<CalendarSettings>('/api/settings').then(setSettings, () => {});
    setTz(new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '');
  }, [admin]);

  // The loader reads these through refs so its identity never changes; a new function would make
  // FullCalendar treat it as a new event source and refetch on every keystroke or click.
  const showFreeRef = useRef(showFree);
  const durationRef = useRef(form.duration);
  const teacherRef = useRef(form.teacher?.id);
  showFreeRef.current = showFree;
  durationRef.current = form.duration;
  teacherRef.current = form.teacher?.id;

  const adminRef = useRef(admin);
  const meIdRef = useRef(me.id);
  const loadEvents = useCallback(async (info: { start: Date; end: Date }): Promise<EventInput[]> => {
    const qs = `from=${encodeURIComponent(info.start.toISOString())}&to=${encodeURIComponent(info.end.toISOString())}`;
    try {
      const { events: list } = await api<{ events: CalendarEvent[] }>(`/api/events?${qs}`);
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

  const eventContent = useMemo(() => makeEventContent({ showTeacher: admin }), [admin]);

  const stats = useMemo(() => {
    const live = events.filter((e) => e.status === 'confirmed');
    const byCategory = hoursByCategory(live);
    const booked = byCategory.tutoring + byCategory.office_hours + byCategory.personal;
    return { sessions: live.length, byCategory, booked, capacity: admin ? null : range ? capacityHours(settings, range.start, range.end) : 0 };
  }, [events, settings, range, admin]);

  const missing: string[] = [];
  if (admin && !form.teacher) missing.push('a teacher');
  if (!form.title.trim()) missing.push('a title');
  if (!form.date) missing.push('a date');
  if (!form.time) missing.push('a start time');
  if (form.category === 'tutoring' && form.students.length === 0) missing.push('at least one student');

  const openCreate = () => {
    setPanel('create');
    setPicked(null);
    setError('');
    setConflict(null);
  };

  function onSelect(info: DateSelectArg) {
    openCreate();
    const d = info.start;
    if (info.allDay) setForm((f) => ({ ...f, date: ymd(d) }));
    else setForm((f) => ({ ...f, date: ymd(d), time: hm(d), duration: Math.max(5, Math.round((info.end.getTime() - d.getTime()) / 60000)) }));
  }

  async function move(info: EventDropArg | EventResizeDoneArg) {
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
    setPanel((p) => (p === 'details' ? 'create' : p));
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
          durationMinutes: form.duration,
          participants: participantsOut(form.students),
          meet: form.meet,
          category: form.category,
          force,
          ...(admin && form.teacher ? { ownerId: form.teacher.id, ownerEmail: form.teacher.email, ownerName: form.teacher.name ?? undefined } : {}),
        }),
      });
      setForm({ ...form, title: '', students: [] });
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

  async function cancel(id: string) {
    if (!confirm('Cancel this class and notify the students?')) return;
    try {
      await api(`/api/events/${id}`, { method: 'DELETE' });
      setPicked(null);
      setPanel('create');
      setError('');
      refetch();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const nav = (a: 'prev' | 'next' | 'today') => {
    const c = cal.current?.getApi();
    if (a === 'prev') c?.prev();
    else if (a === 'next') c?.next();
    else c?.today();
  };

  return (
    <div className="shell">
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
                slotDuration="00:30:00"
                slotLabelInterval="01:00"
                slotLabelContent={slotLabel}
                scrollTime="08:00:00"
                eventOverlap
                dayHeaderContent={dayHeader}
                eventContent={eventContent}
                eventClassNames={(a) => (a.event.extendedProps.ev ? [`cat-${(a.event.extendedProps.ev as CalendarEvent).category}`] : [])}
                events={eventSource}
                datesSet={onDates}
                select={onSelect}
                eventClick={(a: EventClickArg) => { setPicked(a.event.extendedProps.ev as CalendarEvent); setPanel('details'); setError(''); setConflict(null); }}
                eventDrop={move}
                eventResize={move}
              />
            </div>
          </div>
        </section>
        {panel === 'create' && (
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
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'details' && picked && (
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
          />
        )}
      </div>
    </div>
  );
}
