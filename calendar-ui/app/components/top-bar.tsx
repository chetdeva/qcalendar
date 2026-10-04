import type { EventCategory, Me } from '@/lib/calendar';
import { CATEGORIES, CATEGORY_ORDER, hoursLabel } from '@/lib/format';
import { Icon } from './ui-icon';
import type { ViewType } from './calendar-toolbar';
import { UserMenu } from './user-menu';

const SCOPE: Record<ViewType, string> = { timeGridWeek: 'this week', timeGridDay: 'today', dayGridMonth: 'this month' };

interface Props {
  me: Me;
  sessions: number;
  bookedHours: number;
  /** null when there is no single calendar to measure against (admins). */
  capacityHours: number | null;
  byCategory: Record<EventCategory, number>;
  view: ViewType;
  showFree: boolean;
  canShade: boolean;
  onShowFree: (v: boolean) => void;
  onQuickAdd: () => void;
}

export function TopBar(p: Props) {
  const pct = p.capacityHours ? Math.min(100, (p.bookedHours / p.capacityHours) * 100) : 0;
  const chips = CATEGORY_ORDER.filter((c) => p.byCategory[c] > 0);
  return (
    <header className="utility">
      <div className="u-row">
        <div className="sync-pill">
          <span className="dot on" />
          <span className="sync-label">{p.me.role === 'admin' ? 'All classes' : 'My calendar'}</span>
          <span className="sync-meta">• {p.sessions} {p.sessions === 1 ? 'class' : 'classes'} {SCOPE[p.view]}</span>
        </div>
        {p.capacityHours !== null && (
          <div className="util">
            <span className="caps">Utilization:</span>
            <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Utilization">
              <div style={{ width: `${pct}%` }} />
            </div>
            <span className="util-hrs">{hoursLabel(p.bookedHours)} hrs</span>
          </div>
        )}
        {p.canShade && (
          <label className="free-toggle">
            <input type="checkbox" checked={p.showFree} onChange={(e) => p.onShowFree(e.target.checked)} />
            Shade free times for this duration
          </label>
        )}
        <UserMenu me={p.me} />
      </div>
      <div className="u-row">
        {chips.length === 0 && <span className="chip muted-chip">No classes in view</span>}
        {chips.map((c) => (
          <span key={c} className="chip">
            <Icon name={c === 'tutoring' ? 'tutoring' : c === 'office_hours' ? 'office-hours' : 'personal'} color={CATEGORIES[c].color} />
            {hoursLabel(p.byCategory[c])}h {CATEGORIES[c].short}
          </span>
        ))}
        <button type="button" className="quick-add" onClick={p.onQuickAdd}>
          <Icon name="plus-circle" color="#fff" />
          Quick Add Lesson
        </button>
      </div>
    </header>
  );
}
