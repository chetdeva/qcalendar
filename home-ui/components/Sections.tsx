import Image from 'next/image';
import { ArrowRight, CalendarCheck, CheckCircle2, ExternalLink, Quote, Star } from 'lucide-react';
import MobileNav from './MobileNav';
import { PlanButton } from './PlanDialog';
import { ACCOUNTS_URL, BRAND, fill, footer, founder, framework, hero, nav, reviews, site, whatsappLink, why } from '@/content/site';

function WhatsApp({ className = 'wa' }: { className?: string }) {
  return <Image src="/images/whatsapp-glyph-white.png" alt="" width={20} height={20} className={className} />;
}

export function Header() {
  return (
    <header className="top">
      <div className="wrap top-in">
        <a className="logo" href="#top" aria-label={`${BRAND} home`}>
          <Image src="/images/quanttoria-mark.png" alt="" width={40} height={38} priority />
          <b>{BRAND}</b>
        </a>
        <nav aria-label="Main">
          {nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
        </nav>
        <a className="btn btn-primary" href={`${ACCOUNTS_URL}/login`}>Login</a>
        <MobileNav links={nav} />
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
      <section className="wrap hero">
        <div>
          <p className="chip chip-blue badge"><Star size={14} aria-hidden /> {hero.badge}</p>
          <h1>{hero.title[0]}<br /><em>{hero.title[1]}<svg viewBox="0 0 250 14" preserveAspectRatio="none" aria-hidden><path d="M3 9 Q 70 1, 130 8 T 247 6" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" /></svg></em></h1>
          <p className="lede">{fill(hero.body)}</p>
          <div className="cta-row">
            <PlanButton className="btn btn-primary btn-lg">Customize your plan</PlanButton>
            <a className="btn btn-outline btn-lg" href="#how-it-works">See how we teach <ArrowRight size={18} aria-hidden /></a>
          </div>
          <ul className="stats">
            {hero.stats.map((s) => (
              <li key={s.label}><b>{s.value}<small>{s.unit}</small></b><span>{s.label}</span></li>
            ))}
          </ul>
        </div>
        <div className="hero-right">
          <div className="photo">
            <Image src="/images/hero-kid-math-realistic.png" alt={hero.imageAlt} width={800} height={800} priority sizes="(max-width: 1000px) 100vw, 560px" style={{ transform: 'scaleX(-1)' }} />
            <span className="sticker s1" aria-hidden>{hero.stickers[0]}</span>
            <span className="sticker s2" aria-hidden>{hero.stickers[1]}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export function Why() {
  return (
    <section id="why" className="band">
      <div className="wrap">
        <div className="why-top">
          <Image className="why-img" src="/images/visual-math.png" alt={why.imageAlt} width={1024} height={1024} sizes="(max-width: 1000px) 100vw, 560px" />
          <div>
            <p className="pill">{why.eyebrow}</p>
            <h2>{why.title}</h2>
            <p className="muted lede2">{why.introLead}</p>
            <ul className="bullets">{why.intro.map((t) => <li key={t}><CheckCircle2 size={18} aria-hidden /> {t}</li>)}</ul>
          </div>
        </div>
        <ul className="grid4">
          {why.reasons.map((r, i) => (
            <li key={r.title} className="card stage">
              <div className="row"><span className="emoji" aria-hidden>{r.icon}</span><span className="num">{i + 1}</span></div>
              <h3>{r.title}</h3>
              <p className="muted">{r.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Framework() {
  const f = framework;
  return (
    <section id="how-it-works" className="wrap sec">
      <div className="sec-head">
        <div><p className="pill">{f.eyebrow}</p><h2>{f.title}</h2></div>
        <p className="muted">{f.intro}</p>
      </div>
      <ol className="grid4">
        {f.stages.map((s, i) => (
          <li key={s.title} className="card stage">
            <div className="row"><span className="emoji" aria-hidden>{s.icon}</span><span className="chip chip-blue">Step {String(i + 1).padStart(2, '0')}</span></div>
            <h3>{s.title}</h3>
            <p className="muted">{s.text}</p>
          </li>
        ))}
      </ol>

      <div className="boards">
        <div>
          <p className="pill pill-light">US learning support</p>
          <h3>{f.boardsTitle}</h3>
          <p>{f.boardsText}</p>
        </div>
        <ul>
          {f.boards.map((b) => <li key={b.name}><span className="chip chip-sun">{b.name}</span><p className="muted small">{b.text}</p></li>)}
        </ul>
      </div>

      <div className="free">
        <div><h3>{f.free.title}</h3><p className="muted">{fill(f.free.text)}</p></div>
        <PlanButton className="btn btn-primary">{f.free.cta}</PlanButton>
      </div>

      <div className="outcomes">
        <div>
          <h3>{f.outcomesTitle}</h3>
          <ul>{f.outcomes.map((o) => <li key={o}><CheckCircle2 size={18} aria-hidden /> {o}</li>)}</ul>
        </div>
        <div className="card">
          <h3>{f.whoTitle}</h3>
          <div className="chips">{f.who.map((g) => <span key={g} className="chip chip-blue">{g}</span>)}</div>
          <p className="muted small">{f.whoText}</p>
          <p className="note">{f.whoNote}</p>
        </div>
      </div>
    </section>
  );
}

export function Founder() {
  return (
    <section id="tutor" className="band band-blue">
      <div className="wrap founder">
        <div>
          <p className="pill">{founder.eyebrow}</p>
          <Image className="founder-img" src="/images/princy.jpg" alt={`Portrait of ${site.owner.name}`} width={226} height={442} />
        </div>
        <div className="founder-body">
          <h2>{site.owner.name}</h2>
          <p className="role">{site.owner.role} &amp; {founder.tagline}</p>
          <div className="founder-links">
            <a className="btn btn-wa" href={whatsappLink()} target="_blank" rel="noopener noreferrer"><WhatsApp /> Connect on WhatsApp</a>
            <a className="btn btn-ghost" href={site.owner.linkedinUrl} target="_blank" rel="noopener noreferrer">Connect on LinkedIn <ExternalLink size={14} aria-hidden /></a>
          </div>
          <blockquote><Quote size={28} aria-hidden /> {founder.quote}</blockquote>
          <p>{founder.text}</p>
          <dl className="creds">
            {founder.credentials.map((c) => <div key={c.label}><dt>{c.label}</dt><dd>{c.value}</dd></div>)}
          </dl>
        </div>
      </div>
    </section>
  );
}

export function Reviews() {
  return (
    <section id="reviews" className="wrap sec">
      <div className="sec-head">
        <div><p className="pill">{reviews.eyebrow}</p><h2>{reviews.title}</h2></div>
      </div>
      <ul className="stats stats-row">
        {reviews.stats.map(([v, l]) => <li key={l}><b>{v}</b><span>{l}</span></li>)}
      </ul>
      <div className="rev-head">
        <h3>{reviews.heading}</h3>
        <a className="link" href={site.trustpilotUrl} target="_blank" rel="noopener noreferrer">{reviews.all} <ExternalLink size={14} aria-hidden /></a>
      </div>
      <ul className="rev-list" aria-label="Parent testimonials">
        {reviews.list.map((r) => (
          <li key={r.name + r.text.slice(0, 20)}>
            <a className="card review" href={site.trustpilotUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.name}’s review on Trustpilot`}>
              <span className="stars" role="img" aria-label="5 out of 5 stars">★★★★★</span>
              <blockquote>“{r.text}”</blockquote>
              <span className="who"><b>{r.name}</b><span>{r.where}</span></span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Footer() {
  return (
    <footer id="contact" className="band end">
      <div className="wrap"><p className="pill">Contact</p></div>
      <div className="wrap foot">
        <div className="foot-brand">
          <Image src="/images/quanttoria-logo.png" alt={`${BRAND}: Empowering Global Minds with Mathematics`} width={861} height={678} sizes="96px" className="foot-logo" />
          <div>
            <p className="muted small">{footer.about}</p>
            <p className="legal">© {new Date().getFullYear()} {BRAND}. All rights reserved.</p>
          </div>
        </div>
        <div className="foot-links">
          <nav aria-label="Footer">
            {nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
          <div className="foot-contact">
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">WhatsApp {site.whatsappDisplay}</a>
            {site.emails.map((e) => <a key={e} href={`mailto:${e}`}>{e}</a>)}
          </div>
        </div>
      </div>
      <PlanButton className="float btn btn-primary"><CalendarCheck size={18} aria-hidden /> Book a free demo</PlanButton>
    </footer>
  );
}
