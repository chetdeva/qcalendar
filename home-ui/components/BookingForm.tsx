'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { focusAreas, grades } from '@/content/site';

// Visual only for now: nothing is sent or stored (see README). Submitting just shows a notice.
export default function BookingForm() {
  const [grade, setGrade] = useState(grades[0].id);
  const [sent, setSent] = useState(false);

  return (
    <form
      id="book"
      className="book"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <div className="book-head">
        <div>
          <p className="eyebrow">Step 1 of 2 • Fast Matching</p>
          <h2>Book Your 45-Min Diagnostic Evaluation</h2>
        </div>
        <span className="chip chip-blue">100% Free</span>
      </div>

      <fieldset className="grades">
        <legend>Student’s School Grade:</legend>
        {grades.map((g) => (
          <label key={g.id} className={grade === g.id ? 'grade on' : 'grade'}>
            <input type="radio" name="grade" value={g.id} checked={grade === g.id} onChange={() => setGrade(g.id)} />
            <strong>{g.title}</strong>
            <small>{g.sub}</small>
          </label>
        ))}
      </fieldset>

      <div className="two">
        <label className="fld">Parent Name
          <input name="parent" required autoComplete="name" placeholder="e.g. Jessica Miller" />
        </label>
        <label className="fld">Email / Mobile (US)
          <input name="contact" required autoComplete="email" placeholder="(555) 000-0000" />
        </label>
      </div>

      <label className="fld">Primary Academic Focus Area
        <select name="focus">{focusAreas.map((f) => <option key={f}>{f}</option>)}</select>
      </label>

      <button className="btn btn-primary btn-block" type="submit">
        Match With Certified Coach &amp; Reserve Slot <ArrowRight size={16} aria-hidden />
      </button>
      {sent && <p className="notice" role="status">Thanks! Online booking opens soon. Nothing has been sent yet.</p>}
    </form>
  );
}
