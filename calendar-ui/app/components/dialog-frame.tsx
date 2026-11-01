'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/** Where the lesson dialog goes: beside the clicked slot or class (right of it, else left), at about its height; undefined = the default corner. */
function place(a: DOMRect | null): CSSProperties | undefined {
  if (!a || window.innerWidth <= 960) return undefined;
  const W = 440, gap = 12, vw = window.innerWidth, vh = window.innerHeight;
  const left = a.right + gap + W <= vw - gap ? a.right + gap : a.left - gap - W >= gap ? a.left - gap - W : null;
  if (left === null) return undefined;
  const top = Math.min(Math.max(a.top - 24, 80), Math.max(80, vh - 600));
  return { position: 'fixed', left, top, width: W, maxHeight: vh - top - gap };
}

/**
 * Holds the lesson dialog. It opens beside `anchor` (a clicked class), or beside the slot being booked when `slot` is set and
 * that slot is on screen, and then stays where it is while the form is edited. Kept as its own component, with its own state,
 * so placing it never re-renders the calendar.
 */
export function DialogFrame({ anchor, slot, children }: { anchor: DOMRect | null; slot?: boolean; children: ReactNode }) {
  const [style, setStyle] = useState<CSSProperties | undefined>();
  useEffect(() => {
    const id = window.setTimeout(() => { // after the calendar has drawn the slot
      if (!slot) return setStyle(place(anchor));
      const s = document.querySelector('.pending-slot')?.getBoundingClientRect();
      const g = document.querySelector('.fchost')?.getBoundingClientRect();
      const shown = s && g && s.top >= Math.max(g.top, 0) && s.bottom <= Math.min(g.bottom, window.innerHeight);
      setStyle(shown ? place(s) : undefined);
    }, 60);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="dlg" style={style}>{children}</div>;
}
