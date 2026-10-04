import type { EventCategory } from '@/lib/calendar';
import { CATEGORIES, CATEGORY_ORDER, hoursLabel } from '@/lib/format';
import { Icon } from './icon';

import type { ViewType } from './calendar-toolbar';

const SCOPE: Record<ViewType, string> = { timeGridWeek: 'this week', timeGridDay: 'today', dayGridMonth: 'this month' };

interface Props {
  connected: boolean | null;
  sessions: number;
  bookedHours: number;
  capacityHours: number;
  byCategory: Record<EventCategory, number>;
  view: ViewType;
  showFree: boolean;
  onShowFree: (v: boolean) => void;
  onQuickAdd: () => void;
}

export function TopBar(p: Props) {
  const pct = p.capacityHours > 0 ? Math.min(100, (p.bookedHours / p.capacityHours) * 100) : 0;
  const chips = CATEGORY_ORDER.filter((c) => p.byCategory[c] > 0);
  return (
    <header className="utility">
      <div className="u-row">
        <div className="sync-pill">
          <span className={`dot ${p.connected ? 'on' : ''}`} />
          <span className="sync-label">{p.connected === null ? 'Checking sync…' : p.connected ? 'Auto-Sync Active' : 'Google not connected'}</span>
          <span className="sync-meta">• {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'} booked {SCOPE[p.view]}</span>
        </div>
        <div className="util">
          <span className="caps">Utilization:</span>
          <div className="bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Utilization">
            <div style={{ width: `${pct}%` }} />
          </div>
          <span className="util-hrs">{hoursLabel(p.bookedHours)} hrs</span>
        </div>
        <label className="free-toggle">
          <input type="checkbox" checked={p.showFree} onChange={(e) => p.onShowFree(e.target.checked)} />
          Shade free times for this duration
        </label>
      </div>
      <div className="u-row">
        {chips.length === 0 && <span className="chip muted-chip">No lessons in view</span>}
        {chips.map((c) => (
          <span key={c} className="chip">
            <Icon name={c === 'tutoring' ? 'tutoring' : c === 'office_hours' ? 'office-hours' : 'personal'} color={c === 'tutoring' ? '#732de4' : c === 'office_hours' ? '#005bbf' : '#727785'} />
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
