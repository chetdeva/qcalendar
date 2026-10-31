'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';

/** The floating "Book a free demo" button. It steps aside while the booking form is on screen, so it never covers a field (phones). */
export default function FloatBook() {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const form = document.getElementById('book');
    if (!form) return;
    const io = new IntersectionObserver(([e]) => setAway(e.isIntersecting), { threshold: 0.05 });
    io.observe(form);
    return () => io.disconnect();
  }, []);
  return <a className={`float btn btn-primary${away ? ' is-away' : ''}`} href="#book" tabIndex={away ? -1 : undefined} aria-hidden={away || undefined}><CalendarCheck size={18} aria-hidden /> Book a free demo</a>;
}
