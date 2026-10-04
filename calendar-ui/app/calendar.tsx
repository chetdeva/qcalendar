'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import type { CalendarEvent, CalendarSettings } from '@/lib/calendar';
import { capacityHours, hm, hoursByCategory, mergeSlots, minutesBetween, parseEmails, ymd } from '@/lib/format';
import { TopBar } from './components/top-bar';
import { CalendarToolbar, type ViewType } from './components/calendar-toolbar';
import { CreateDrawer, DetailsDrawer, type LessonForm } from './components/lesson-drawer';
import { dayHeader, makeEventContent } from './components/event-content';

const PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin];
const slotLabel = (a: { date: Date }) => a.date.toLocaleTimeString('en-US', { hour: 'numeric' });

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? res.statusText, res.status);
  return json as T;
}

const blankForm = (): LessonForm => ({ title: '', date: ymd(new Date()), time: '10:00', duration: 60, attendees: '', meet: true, category: 'tutoring' });

export default function Calendar() {
  const cal = useRef<FullCalendar>(null);
  const [view, setView] = useState<ViewType>('timeGridWeek');
  const [title, setTitle] = useState('');
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<'create' | 'details' | null>('create');
  const [picked, setPicked] = useState<CalendarEvent | null>(null);
  const [form, setForm] = useState<LessonForm>(blankForm);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFree, setShowFree] = useState(true);
  const [studentSessions, setStudentSessions] = useState<number | null>(null);
  const [tz, setTz] = useState('');

  const refetch = () => cal.current?.getApi().refetchEvents();

  useEffect(() => {
    api<CalendarSettings>('/api/settings').then(setSettings, () => {});
    api<{ connected: boolean }>('/api/google/status').then((s) => setConnected(s.connected), () => setConnected(false));
    setTz(new Intl.DateTimeFormat('en-US', { timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '');
  }, []);

  // The loader reads these through refs so its identity never changes; a new function would make
  // FullCalendar treat it as a new event source and refetch on every keystroke or click.
  const showFreeRef = useRef(showFree);
  const durationRef = useRef(form.duration);
  showFreeRef.current = showFree;
  durationRef.current = form.duration;

  const loadEvents = useCallback(async (info: { start: Date; end: Date }): Promise<EventInput[]> => {
    const qs = `from=${encodeURIComponent(info.start.toISOString())}&to=${encodeURIComponent(info.end.toISOString())}`;
    try {
      const { events: list } = await api<{ events: CalendarEvent[] }>(`/api/events?${qs}`);
      setEvents(list);
      const items: EventInput[] = list.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, extendedProps: { ev: e } }));
      if (showFreeRef.current) {
        const a = await api<{ slots: { start: string; end: string }[] }>(`/api/availability?${qs}&duration=${durationRef.current}`);
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

  const eventContent = useMemo(() => makeEventContent(Boolean(connected)), [connected]);

  const stats = useMemo(() => {
    const live = events.filter((e) => e.status === 'confirmed');
    const byCategory = hoursByCategory(live);
    const booked = byCategory.tutoring + byCategory.office_hours + byCategory.personal;
    return { sessions: live.length, byCategory, booked, capacity: range ? capacityHours(settings, range.start, range.end) : 0 };
  }, [events, settings, range]);

  const emails = parseEmails(form.attendees);
  const firstEmail = emails.valid[0];
  useEffect(() => {
    setStudentSessions(null);
    if (!firstEmail) return;
    let stale = false;
    const t = setTimeout(() => {
      api<{ events: CalendarEvent[] }>(`/api/events?attendee=${encodeURIComponent(firstEmail)}`).then(
        (r) => !stale && setStudentSessions(r.events.length),
        () => !stale && setStudentSessions(0),
      );
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [firstEmail]);

  const missing: string[] = [];
  if (!form.title.trim()) missing.push('a title');
  if (!form.date) missing.push('a date');
  if (!form.time) missing.push('a start time');
  if (emails.invalid.length) missing.push(`valid emails (check: ${emails.invalid.join(', ')})`);
  else if (!emails.valid.length) missing.push('at least one student email');

  const openCreate = () => {
    setPanel('create');
    setPicked(null);
    setError('');
    setConflict(false);
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
      if (err.status === 409 && confirm('That time overlaps another event. Move it anyway?')) {
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
  }

  async function create(force = false) {
    if (missing.length) return;
    setBusy(true);
    setError('');
    setConflict(false);
    try {
      await api('/api/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          start: new Date(`${form.date}T${form.time}`).toISOString(),
          durationMinutes: form.duration,
          attendees: emails.valid,
          meet: form.meet,
          category: form.category,
          force,
        }),
      });
      setForm({ ...form, title: '', attendees: '' });
      cal.current?.getApi().unselect();
      refetch();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) setConflict(true);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    if (!confirm('Cancel this lesson and notify attendees?')) return;
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
      <TopBar
        connected={connected}
        sessions={stats.sessions}
        bookedHours={stats.booked}
        capacityHours={stats.capacity}
        byCategory={stats.byCategory}
        view={view}
        showFree={showFree}
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
              eventClick={(a: EventClickArg) => { setPicked(a.event.extendedProps.ev as CalendarEvent); setPanel('details'); setError(''); }}
              eventDrop={move}
              eventResize={move}
            />
            </div>
          </div>
        </section>
        {panel === 'create' && (
          <CreateDrawer
            form={form}
            setForm={setForm}
            emails={emails}
            missing={missing}
            busy={busy}
            error={error}
            conflict={conflict}
            connected={connected}
            studentSessions={studentSessions}
            onCreate={create}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'details' && picked && (
          <DetailsDrawer ev={picked} connected={connected} error={error} onCancel={() => cancel(picked.id)} onNew={openCreate} onClose={() => setPanel(null)} />
        )}
      </div>
    </div>
  );
}
