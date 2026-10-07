import type { DayHeaderContentArg, EventContentArg } from '@fullcalendar/core';
import type { CalendarEvent } from '@/lib/calendar';
import { CATEGORIES, minutesBetween, participantsLabel, rangeLabel, timeLabel } from '@/lib/format';
import { Icon } from './ui-icon';

const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function dayHeader(arg: DayHeaderContentArg) {
  const dow = WEEKDAY[arg.date.getDay()];
  if (!arg.view.type.startsWith('timeGrid')) return <span className="dh-dow">{dow}</span>;
  return (
    <div className="dh">
      <span className="dh-dow">{dow}</span>
      <span className="dh-num">{arg.date.getDate()}</span>
      {arg.isToday && <span className="dh-dot" />}
    </div>
  );
}

export function makeEventContent(opts: { showTeacher?: boolean; showStudents?: boolean } = {}) {
  return function eventContent(arg: EventContentArg) {
    const ev = arg.event.extendedProps.ev as CalendarEvent | undefined;
    if (!ev) return null;
    const cat = CATEGORIES[ev.category];

    if (arg.view.type === 'dayGridMonth') {
      return (
        <div className="mc">
          <span className="mc-dot" style={{ background: cat.color }} />
          <span className="mc-time">{timeLabel(ev.start)}</span>
          <span className="mc-title">{ev.title}</span>
        </div>
      );
    }

    const minutes = minutesBetween(ev.start, ev.end);
    const guest = [opts.showTeacher ? ev.ownerName : '', opts.showStudents === false ? '' : participantsLabel(ev)].filter(Boolean).join(' · ');
    if (minutes <= 45) {
      return (
        <div className="ec ec-compact">
          <span className="ec-title">{ev.title}</span>
          <span className="ec-time">{timeLabel(ev.start)}</span>
        </div>
      );
    }
    return (
      <div className="ec">
        <div className="ec-top">
          <span className="ec-badge">
            <Icon name={cat.icon} color="currentColor" />
            {cat.badge}
          </span>
          {ev.myStatus === 'invited' && <span className="ec-pending">Reply</span>}
        </div>
        <div className="ec-title">{ev.title}</div>
        {guest && <div className="ec-sub">{guest}</div>}
        <div className="ec-foot">
          <span className="ec-time">{rangeLabel(ev.start, ev.end)}</span>
          {ev.meetingUrl && <Icon name="video" color="#005bbf" />}
        </div>
      </div>
    );
  };
}
