'use client';

import { useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { grades, site, whatsappLink } from '@/content/site';

const ID = 'book';

/** Any button that opens the plan dialog. */
export function PlanButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => (document.getElementById(ID) as HTMLDialogElement).showModal()}>
      {children}
    </button>
  );
}

// Same idea as the Quanttoria contact form: the details become a WhatsApp message to Princy.
// Nothing is stored or sent by this site.
export default function PlanDialog() {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <dialog
      id={ID}
      ref={ref}
      className="plan"
      aria-labelledby="plan-title"
      onClick={(e) => e.target === ref.current && ref.current.close()} // click on the backdrop
    >
      <form
        className="book"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const goal = String(f.get('goal')).trim();
          const message = `Hi Princy! I'd like to customize a learning plan for my child.\n\nParent: ${f.get('parent')}\nChild: ${f.get('child')}\nGrade: ${f.get('grade')}${goal ? `\nLearning goals or challenges: ${goal}` : ''}`;
          const w = window.open(whatsappLink(message), '_blank');
          if (w) w.opener = null;
          ref.current?.close();
        }}
      >
        <button type="button" className="plan-x" aria-label="Close" onClick={() => ref.current?.close()}><X size={20} aria-hidden /></button>
        <div>
          <p className="eyebrow">Customize your plan</p>
          <h2 id="plan-title">Let’s build a plan that fits your child</h2>
          <p className="muted small">Your first demo class is free. We’ll reply on WhatsApp ({site.whatsappDisplay}).</p>
        </div>

        <div className="two">
          <label className="fld">Parent/Guardian name
            <input name="parent" required autoComplete="name" placeholder="Your name" />
          </label>
          <label className="fld">Child’s name
            <input name="child" required placeholder="Their name" />
          </label>
        </div>
        <label className="fld">Grade
          <select name="grade" defaultValue={grades[0]}>{grades.map((g) => <option key={g}>{g}</option>)}</select>
        </label>
        <label className="fld">Learning goals or challenges (optional)
          <textarea name="goal" rows={3} placeholder="e.g. Fractions are difficult, analysing word problems, or preparing for a global assessment" />
        </label>

        <button className="btn btn-primary btn-block" type="submit">
          Customize my child’s plan <ArrowRight size={16} aria-hidden />
        </button>
        <p className="muted small">This opens WhatsApp with your details filled in. Nothing is stored on this site.</p>
      </form>
    </dialog>
  );
}
