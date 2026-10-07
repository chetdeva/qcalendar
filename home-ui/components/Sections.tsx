import { ArrowRight, BadgeCheck, CalendarDays, CheckCircle2, Award, GraduationCap, ShieldCheck, Star, User } from 'lucide-react';
import BookingForm from './BookingForm';
import Portals from './Portals';
import { ACCOUNTS_URL, BRAND, coaches, fill, footer, framework, hero, nav, portals, reviews, trust } from '@/content/site';

export function Header() {
  return (
    <header className="top">
      <div className="wrap top-in">
        <a className="logo" href="#top"><b>{BRAND}</b><small>Grades 1–10 US</small></a>
        <nav aria-label="Main">
          {nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
        </nav>
        <a className="login" href={`${ACCOUNTS_URL}/login`}>Log In</a>
        <a className="btn btn-primary" href="#book">Book Free Demo</a>
        <a className="avatar" href={`${ACCOUNTS_URL}/signup`} aria-label="Create an account"><User size={18} aria-hidden /></a>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <div className="hero-bg">
    <div className="doodles" aria-hidden>
      <span style={{ top: 40, left: '6%', rotate: '12deg' }}>➕</span><span style={{ top: 150, left: '2%' }}>✨</span>
      <span style={{ top: 70, right: '6%', rotate: '40deg' }}>📐</span><span style={{ bottom: 60, right: '3%' }}>🌟</span>
      <span style={{ bottom: 90, left: '48%' }}>➗</span>
    </div>
    <section id="why" className="wrap hero">
      <div>
        <p className="chip chip-blue badge">● {hero.badge}</p>
        <h1>{hero.title[0]}<br /><em>{hero.title[1]}<svg viewBox="0 0 250 14" preserveAspectRatio="none" aria-hidden><path d="M3 9 Q 70 1, 130 8 T 247 6" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" /></svg></em></h1>
        <p className="lede">{fill(hero.body).split('Adversity Quotient (AQ)').flatMap((t, i) => (i ? [<span key={i} className="mark">Adversity Quotient (AQ)</span>, t] : [t]))}</p>
        <div className="cta-row">
          <a className="btn btn-primary btn-lg" href="#book">Book Your Free Demo <CalendarDays size={18} aria-hidden /></a>
          <p className="small"><CheckCircle2 size={16} aria-hidden /> {hero.note}</p>
        </div>
        <ul className="stats">
          {hero.stats.map((s) => (
            <li key={s.label}><b>{s.value}<small>{s.unit}</small></b><span>{s.label}</span></li>
          ))}
        </ul>
      </div>
      <div className="hero-right">
        {/* ponytail: gradient stand-in for the photo; swap for a real <Image> in public/ */}
        <div className="photo" aria-hidden>
          <span className="chip chip-white">{hero.card.tag}</span>
          <span className="sticker">From tears to A’s! 🎓</span>
          <span className="glyph">∑ π √</span>
          <div className="photo-card">
            <Award size={22} aria-hidden />
            <div><strong>{hero.card.title}</strong><p>{hero.card.text}</p></div>
            <span className="chip chip-green">{hero.card.chip}</span>
          </div>
        </div>
        <BookingForm />
      </div>
    </section>
    </div>
  );
}

export function Framework() {
  return (
    <section id="how-it-works" className="band">
      <div className="wrap">
        <div className="sec-head">
          <div><p className="eyebrow">{framework.eyebrow}</p><h2>{fill(framework.title)}</h2></div>
          <p className="muted">{framework.intro}</p>
        </div>
        <div className="grid4">
          {framework.stages.map((s, i) => (
            <article key={s.title} className="card stage">
              <div className="row"><span className="emoji" aria-hidden>{s.icon}</span><span className="chip chip-blue">Stage {String(i + 1).padStart(2, '0')}</span></div>
              <h3>{s.title}</h3>
              <p className="muted">{s.text}</p>
              <p className="tag"><BadgeCheck size={14} aria-hidden /> {s.tag}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Coaches() {
  return (
    <section id="coaches" className="wrap sec">
      <div className="sec-head">
        <div><p className="eyebrow">{coaches.eyebrow}</p><h2>{coaches.title}</h2></div>
        <div className="vet"><ShieldCheck size={22} aria-hidden /><div><strong>{coaches.vetting.title}</strong><p className="muted">{coaches.vetting.text}</p></div></div>
      </div>
      <div className="grid3">
        {coaches.list.map((c) => (
          <article key={c.name} className="card coach">
            {/* ponytail: initials stand in for coach photos */}
            <div className="coach-photo" aria-hidden><span>{c.initials}</span><span className="chip chip-white"><Star size={12} aria-hidden /> {c.rating}</span><span className="chip chip-dark">{c.creds}</span></div>
            <h3>{c.name}</h3>
            <p className="role">{c.role}</p>
            <p className="muted">{c.bio}</p>
            <blockquote><b>Parent praise:</b><br />“{c.praise}”</blockquote>
          </article>
        ))}
        <aside className="card bar-card">
          <span className="seal"><ShieldCheck size={22} aria-hidden /></span>
          <p className="eyebrow">{coaches.bar.eyebrow}</p>
          <h3>{coaches.bar.title}</h3>
          <p className="muted">{coaches.bar.text}</p>
          <ul>{coaches.bar.checks.map((c) => <li key={c}><CheckCircle2 size={16} aria-hidden /> {c}</li>)}</ul>
          <a className="btn btn-dark" href="#book">{coaches.bar.cta}</a>
        </aside>
      </div>

      <div className="reviews">
        <div className="sec-head">
          <div className="rating"><span className="stars" aria-label="5 stars">★★★★★</span><div><h2>{reviews.title}</h2><p className="muted">{reviews.sub}</p></div></div>
          <span className="chip chip-white">● {reviews.badge}</span>
        </div>
        <div className="grid3">
          {reviews.list.map((r) => (
            <figure key={r.who} className="card review">
              <span className="stars small" aria-hidden>★★★★★</span>
              <h3>{r.title}</h3>
              <blockquote>{r.text}</blockquote>
              <figcaption><b>{r.who}</b><span>{r.where}</span></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PortalsSection() {
  return (
    <section id="portals" className="band">
      <div className="wrap">
        <div className="sec-head">
          <div><p className="eyebrow">{portals.eyebrow}</p><h2>{portals.title}</h2></div>
        </div>
        <Portals />
      </div>
    </section>
  );
}

export function TrustAndFooter() {
  const icons = [BadgeCheck, GraduationCap, Award];
  return (
    <footer className="band end">
      <div className="wrap">
        <ul className="trust">
          {trust.map((t, i) => { const Icon = icons[i]; return <li key={t.title}><span className="seal"><Icon size={22} aria-hidden /></span><div><strong>{t.title}</strong><p className="muted">{t.text}</p></div></li>; })}
        </ul>
        <div className="foot">
          <div><b className="logo-b">{BRAND}</b><p className="muted">{footer.about}</p></div>
          {footer.columns.map((c) => (
            <div key={c.title}>
              <h4>{c.title}</h4>
              <p className="link">{c.lead}</p>
              <ul>{c.links.map((l) => <li key={l} className="muted">{l}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} {BRAND} Learning Inc. All rights reserved.</span>
          <span>{footer.legal.join(' · ')}</span>
        </div>
      </div>
      <a className="float" href="#book">⚡ Register for a Demo <ArrowRight size={16} aria-hidden /></a>
    </footer>
  );
}
