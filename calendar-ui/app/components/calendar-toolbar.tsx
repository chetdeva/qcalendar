export type ViewType = 'timeGridWeek' | 'dayGridMonth' | 'timeGridDay';

const VIEWS: { type: ViewType; label: string }[] = [
  { type: 'timeGridDay', label: 'Day' },
  { type: 'timeGridWeek', label: 'Week' },
  { type: 'dayGridMonth', label: 'Month' },
];

interface Props {
  title: string;
  view: ViewType;
  tz: string;
  onNav: (action: 'prev' | 'next' | 'today') => void;
  onView: (v: ViewType) => void;
}

/** Date range, navigation, view switch and timezone, directly above the weekday header. */
export function CalendarToolbar({ title, view, tz, onNav, onView }: Props) {
  return (
    <div className="cal-toolbar">
      <span className="range-title">{title}</span>
      <div className="nav">
        <button type="button" className="nav-btn" aria-label="Previous" onClick={() => onNav('prev')}>‹</button>
        <button type="button" className="nav-btn" onClick={() => onNav('today')}>Today</button>
        <button type="button" className="nav-btn" aria-label="Next" onClick={() => onNav('next')}>›</button>
      </div>
      <div className="cal-toolbar-right">
        <div className="seg view-seg" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button key={v.type} type="button" aria-pressed={view === v.type} className={view === v.type ? 'on' : ''} data-view={v.type} onClick={() => onView(v.type)}>
              {v.label}
            </button>
          ))}
        </div>
        {tz && <span className="tz-chip" title="Calendar timezone">{tz}</span>}
      </div>
    </div>
  );
}
