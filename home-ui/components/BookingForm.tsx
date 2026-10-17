'use client';

import { booking as bk, site, whatsappLink } from '@/content/site';

const ICONS = ['lock', 'no-card', 'verified'];

/** The booking form. Same idea as the Quanttoria contact form: the details become a WhatsApp message to Princy; nothing is stored or sent by this site. */
export default function BookingForm() {
  return (
    <section id="book" className="sec sec-book">
      <div className="wrap">
        <form
          className="book"
          aria-labelledby="book-title"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const grade = bk.grades.find((g) => g.label === f.get('grade'));
            const goal = String(f.get('goal') ?? '').trim();
            const phone = String(f.get('phone')).trim();
            const message = [
              'Hi Princy! I’d like to book a free 1:1 session for my child.',
              '',
              `Parent: ${f.get('parent')}`,
              `Email: ${f.get('email')}`,
              ...(phone ? [`Phone: ${phone}`] : []),
              `Grade: ${grade?.label} (${grade?.note})`,
              ...(goal ? [`Biggest goal: ${goal}`] : []),
            ].join('\n');
            const w = window.open(whatsappLink(message), '_blank');
            if (w) w.opener = null;
          }}
        >
          <div className="book-head">
            <p className="pill pill-sun">{bk.eyebrow}</p>
            <h2 id="book-title">{bk.title}</h2>
            <p className="intro">{bk.sub}</p>
          </div>

          <fieldset className="pick">
            <legend>1. Select child’s grade level 🎒</legend>
            <div className="tiles">
              {bk.grades.map((g, i) => (
                <label key={g.label} className="tile">
                  <input type="radio" name="grade" value={g.label} required={i === 0} />
                  <span className="tile-in"><i aria-hidden>{g.icon}</i><b>{g.label}</b><small>{g.note}</small></span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="pick">
            <legend>2. What is your biggest goal for them? 🎯</legend>
            <div className="goals">
              {bk.goals.map((g) => (
                <label key={g} className="goal">
                  <input type="radio" name="goal" value={g} />
                  <span>{g}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="inputs">
            <label className="field">Parent Full Name
              <input name="parent" required autoComplete="name" placeholder="e.g. Sarah Jenkins" />
            </label>
            <label className="field">Parent Email
              <input name="email" type="email" required autoComplete="email" placeholder="sarah@example.com" />
            </label>
            <label className="field">Phone Number
              <input name="phone" type="tel" autoComplete="tel" placeholder="(555) 000-0000" />
            </label>
          </div>

          <button type="submit" className="btn btn-3d btn-block">{bk.submit}</button>
          <p className="reassure-row">
            {bk.reassure.map((t, i) => <span key={t}><img src={`/figma/${ICONS[i]}.svg`} alt="" width={14} height={14} />{t}</span>)}
          </p>
          <p className="book-note">{bk.note} Replies come on WhatsApp ({site.whatsappDisplay}).</p>
        </form>
      </div>
    </section>
  );
}
