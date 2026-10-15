'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { CalendarEvent } from '@/lib/calendar';
import { CATEGORIES, rangeLabel } from '@/lib/format';
import { api } from '../api-client';
import { Icon } from './ui-icon';

const DAY = 86_400_000;
const dayHeading = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

/** Everything from the start of today to four months ahead, as the signed-in person is allowed to see it. */
export async function fetchUpcoming(): Promise<CalendarEvent[]> {
  const from = new Date(); from.setHours(0, 0, 0, 0);
  const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(new Date(from.getTime() + 120 * DAY).toISOString())}`;
  return (await api<{ events: CalendarEvent[] }>(`/api/events?${qs}`)).events;
}

/** Confirmed classes that have not ended yet. */
export const upcomingOf = (classes: CalendarEvent[] | null) => (classes ?? []).filter((c) => Date.parse(c.end) > Date.now() && c.status === 'confirmed');

interface Props {
  subtitle: string;
  empty: string;
  /** null while loading. */
  classes: CalendarEvent[] | null;
  error: string;
  /** Upcoming classes, grouped under headings; empty groups are skipped. */
  sections: { label: string; items: CalendarEvent[] }[];
  selected: string | null;
  onSelect: (c: CalendarEvent) => void;
  who: (c: CalendarEvent) => string;
  badge?: (c: CalendarEvent) => ReactNode;
  actions?: (c: CalendarEvent) => ReactNode;
}

/** The "My classes" list. Students answer invitations from it; teachers and admins see their scheduled classes. */
export function ClassesPanel(p: Props) {
  const cards = useRef(new Map<string, HTMLElement>());
  useEffect(() => { if (p.selected) cards.current.get(p.selected)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [p.selected]);

  const card = (c: CalendarEvent) => (
    <article key={c.id} ref={(el) => { if (el) cards.current.set(c.id, el); }} className={`class-card ${p.selected === c.id ? 'sel' : ''}`}
      aria-label={`${c.title}, ${dayHeading(c.start)}`} style={{ ['--accent' as string]: CATEGORIES[c.category].color }} onClick={() => p.onSelect(c)}>
      <div className="cc-head"><b>{c.title}</b>{p.badge?.(c)}</div>
      <div className="cc-when">{dayHeading(c.start)} · {rangeLabel(c.start, c.end)}</div>
      <div className="cc-who">{p.who(c)}</div>
      {c.description && <p className="cc-note">{c.description}</p>}
      {c.meetingUrl && (
        <a className="meet-link" href={c.meetingUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Icon name="video" color="#005bbf" /> Join video meeting</a>
      )}
      {p.actions?.(c)}
    </article>
  );

  const group = (list: CalendarEvent[]) => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const c of list) { const k = dayHeading(c.start); byDay.set(k, [...(byDay.get(k) ?? []), c]); }
    return [...byDay.entries()].map(([day, items]) => (
      <div key={day} className="day-group"><h3 className="day-h">{day}</h3>{items.map(card)}</div>
    ));
  };

  const shown = p.sections.filter((s) => s.items.length > 0);
  return (
    <aside className="drawer classes-panel" aria-label="My classes">
      <div className="d-head">
        <div className="d-head-l">
          <span className="d-icon"><Icon name="tutoring" color="#005bbf" /></span>
          <div>
            <h3>My classes</h3>
            <p>{p.subtitle}</p>
          </div>
        </div>
      </div>
      <div className="d-body">
        {p.error && <p className="err" role="alert">{p.error}</p>}
        {p.classes === null && <p className="muted-line">Loading your classes…</p>}
        {p.classes !== null && shown.length === 0 && !p.error && <p className="muted-line" data-testid="no-classes">{p.empty}</p>}
        {shown.map((s) => (
          <section key={s.label} aria-label={s.label}>
            <h2 className="sec-h">{s.label}</h2>
            {group(s.items)}
          </section>
        ))}
      </div>
    </aside>
  );
}
