'use client';

import { useState } from 'react';
import { booking as bk, site, whatsappLink } from '@/content/site';

const ICONS = ['lock', 'no-card', 'verified'];

/** Cookie-free custom event for Plausible; does nothing when analytics is off. */
const track = (name: string) => (window as unknown as { plausible?: (n: string) => void }).plausible?.(name);

type Sent = { name: string; email: string; message: string };

/** Where the visitor came from, as a short label: a utm_source, the referring site, or "direct". */
function sourceLabel() {
  const utm = new URLSearchParams(location.search).get('utm_source');
  if (utm) return utm.slice(0, 100);
  try { return document.referrer ? new URL(document.referrer).hostname.slice(0, 100) : 'direct'; } catch { return 'direct'; }
}

/**
 * The booking form. Pressing the button saves the request (calendar-service emails the teacher and sends the parent a confirmation);
 * WhatsApp stays as a second way to reach the teacher, and as the fallback if saving fails.
 */
export default function BookingForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [sent, setSent] = useState<Sent | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const grade = bk.grades.find((g) => g.label === f.get('grade'));
    const goal = String(f.get('goal') ?? '').trim();
    const phone = String(f.get('phone') ?? '').trim();
    const name = String(f.get('parent') ?? '').trim();
    const email = String(f.get('email') ?? '').trim();
    const message = [
      'Hi Princy! I’d like to book a free 1:1 session for my child.',
      '',
      `Parent: ${name}`,
      `Email: ${email}`,
      ...(phone ? [`Phone: ${phone}`] : []),
      `Grade: ${grade?.label} (${grade?.note})`,
      ...(goal ? [`Biggest goal: ${goal}`] : []),
    ].join('\n');
    setSent({ name, email, message });
    setState('sending');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          parentName: name, email, ...(phone ? { phone } : {}), grade: grade?.label, ...(goal ? { goal } : {}),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, source: sourceLabel(), page: location.pathname,
          website: String(f.get('website') ?? ''), // honeypot, empty for real visitors
        }),
      });
      setState(res.ok ? 'sent' : 'failed');
      if (res.ok) track('form_submit');
    } catch {
      setState('failed');
    }
  }

  const openWhatsApp = (message: string) => { track('whatsapp_click'); const w = window.open(whatsappLink(message), '_blank'); if (w) w.opener = null; };

  if (state === 'sent' && sent) {
    return (
      <section id="book" className="sec sec-book">
        <div className="wrap">
          <div className="book" role="status">
            <div className="book-head">
              <p className="pill pill-sun">{bk.eyebrow}</p>
              <h2 id="book-title">Thank you, {sent.name.split(' ')[0]}! Your request is in.</h2>
              <p className="intro">We sent a confirmation to <b>{sent.email}</b>. Princy will email you within one business day to find a time for your child’s free class.</p>
            </div>
            <button type="button" className="btn btn-wa btn-block" onClick={() => openWhatsApp(sent.message)}>Prefer WhatsApp? Message Princy too</button>
            <p className="book-note">Don’t see our email? Check your spam folder, or write to <a href={`mailto:${site.emails[0]}`}>{site.emails[0]}</a>.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="book" className="sec sec-book">
      <div className="wrap">
        <form
          className="book"
          aria-labelledby="book-title"
          onSubmit={submit}
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

          <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
          {state === 'failed' && (
            <p className="book-error" role="alert">
              We couldn’t save your request just now. Please try again, or <button type="button" className="linklike" onClick={() => sent && openWhatsApp(sent.message)}>send it to Princy on WhatsApp</button> instead.
            </p>
          )}
          <button type="submit" className="btn btn-3d btn-block" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : bk.submit}</button>
          <p className="reassure-row">
            {bk.reassure.map((t, i) => <span key={t}><img src={`/figma/${ICONS[i]}.svg`} alt="" width={14} height={14} />{t}</span>)}
          </p>
          <p className="book-note">{bk.note} We reply by email; you can also reach Princy on WhatsApp ({site.whatsappDisplay}).</p>
        </form>
      </div>
    </section>
  );
}
