import Image from 'next/image';
import { ExternalLink } from 'lucide-react';
import FloatBook from './FloatBook';
import MobileNav from './MobileNav';
import { SiteFooter } from '@components/site-footer';
import { ACCOUNTS_URL, BRAND, founder, framework, hero, nav, reviews, site, whatsappLink, why } from '@/content/site';

function WhatsApp({ className = 'wa' }: { className?: string }) {
  return <Image src="/images/whatsapp-glyph-white.png" alt="" width={20} height={20} className={className} />;
}

/** "Visual proofs show the *why* before…": the starred word is italic. */
const withEmphasis = (s: string) => s.split('*').map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part));

/** Section opener used by every centred section: pill, heading, intro. */
function Head({ id, pill, title, intro, tone = 'sun' }: { id?: string; pill: string; title: string; intro?: string; tone?: 'sun' | 'sky' | 'white' }) {
  return (
    <div className="head" id={id}>
      <p className={`pill pill-${tone}`}>{pill}</p>
      <h2>{title}</h2>
      {intro && <p className="intro">{intro}</p>}
    </div>
  );
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
  const b = hero.banner;
  return (
    <div className="hero-bg">
      <div className="doodles" aria-hidden>
        <span style={{ top: 58, left: 98, rotate: '12deg', fontSize: 30 }}>➕</span><span style={{ top: 163, left: 33, rotate: '-15deg', fontSize: 36 }}>✨</span>
        <span style={{ bottom: 64, left: 153, fontSize: 24 }}>✖️</span><span style={{ top: 44, right: 92, rotate: '45deg', fontSize: 36 }}>📐</span>
        <span style={{ bottom: 77, right: 60, rotate: '12deg', fontSize: 36 }}>🌟</span><span style={{ top: 345, right: 25, fontSize: 30 }}>➗</span>
      </div>
      <section className="wrap hero">
        <p className="banner">
          <span aria-hidden>🎒</span><b className="banner-lead">{b.lead}</b><i aria-hidden>•</i><span>{b.range}</span><i aria-hidden>•</i><span className="banner-free">{b.free}</span>
        </p>
        <div className="hero-grid">
          <div className="hero-left">
            <p className="chip chip-sky"><span aria-hidden>🚀</span> {hero.eyebrow}</p>
            <h1>{hero.title[0]} <em>{hero.title[1]}<img src="/figma/underline.svg" alt="" width={283} height={11} /></em></h1>
            <p className="lede">No kid is <b>“bad at math”</b> — they just need their <mark>aha! moment 💡</mark>. We turn math anxiety and frustration into unstoppable, joyful superpowers.</p>
            <ul className="trust">
              {hero.pills.map((p) => <li key={p.text} className={`tpill tpill-${p.tone}`}><span aria-hidden>{p.icon}</span>{p.text}</li>)}
            </ul>
            <div className="cta">
              <div className="cta-row">
                <a className="btn btn-3d" href="#book">{hero.primary}</a>
                <a className="btn btn-white" href="#how-it-works">{hero.secondary}</a>
              </div>
              <p className="reassure"><img src="/figma/check-circle.svg" alt="" width={13} height={13} /> {hero.reassurance}</p>
            </div>
          </div>
          <div className="hero-right">
            <div className="ring" aria-hidden />
            <div className="photo">
              <Image src="/images/hero-kid-math-realistic.png" alt={hero.imageAlt} width={800} height={800} priority sizes="(max-width: 1000px) 100vw, 480px" style={{ transform: 'scaleX(-1)' }} />
              <span className="float-chip">{hero.chip}</span>
              <div className="stat-card">
                <b>{hero.card.value} <img src="/figma/trend.svg" alt="" width={17} height={10} /></b>
                <span>{hero.card.label}</span>
                <small>{hero.card.note}</small>
              </div>
              <span className="sticker" aria-hidden><i>⚡</i><span><b>{hero.sticker[0]}</b><b className="blue">{hero.sticker[1]}</b></span></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function Why() {
  const { old, fresh, pillars } = why;
  return (
    <section id="why" className="sec sec-white">
      <div className="wrap stack">
        <Head pill={why.eyebrow} title={why.title} intro={why.subtitle} />
        <div className="versus">
          <article className="vs vs-old">
            <header><span className="vs-icon" aria-hidden>{old.icon}</span><div><h3>{old.title}</h3><p>{old.sub}</p></div></header>
            <ul>{old.items.map((t) => <li key={t}><span aria-hidden>✖</span><span>{t}</span></li>)}</ul>
          </article>
          <article className="vs vs-new">
            <header><span className="vs-icon" aria-hidden>{fresh.icon}</span><div><h3>{fresh.title}</h3><p>{fresh.sub}</p></div></header>
            <ul>{fresh.items.map((t) => <li key={t}><span aria-hidden>✔</span><span>{withEmphasis(t)}</span></li>)}</ul>
            <span className="ribbon" aria-hidden>{fresh.ribbon}</span>
          </article>
        </div>
        <div className="pillars">
          <div className="pillars-head"><h3>{pillars.title}</h3><p>{pillars.sub}</p></div>
          <ul className="pillar-list">
            {pillars.list.map((p) => (
              <li key={p.title} className={`pillar tone-${p.tone}`}>
                <span className="icon-box" aria-hidden>{p.icon}</span>
                <h4>{p.title}</h4>
                <p>{p.text}</p>
              </li>
            ))}
          </ul>
          <ul className="proof">
            {why.proof.map(([v, l]) => <li key={l}><b>{v}</b><span>{l}</span></li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function Framework() {
  const f = framework;
  return (
    <section id="how-it-works" className="sec sec-steps">
      <div className="wrap stack">
        <Head pill={f.eyebrow} title={f.title} intro={f.intro} tone="white" />
        <ol className="steps">
          {f.stages.map((s, i) => (
            <li key={s.title} className={`step tone-${s.tone}`}>
              <div>
                <span className="icon-box icon-lg" aria-hidden>{s.icon}</span>
                <span className="step-no">Step {String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
              <p className="step-chip">{s.chip}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function Founder() {
  return (
    <section id="tutor" className="sec sec-coach">
      <div className="wrap stack">
        <Head pill={founder.eyebrow} title={founder.title} intro={founder.intro} tone="white" />
        <div className="coach">
          <div className="coach-photo">
            <div className="frame"><Image className="founder-img" src="/images/princy.jpg" alt={`Portrait of ${site.owner.name}`} width={225} height={225} /></div>
            <a className="rating" href="#reviews"><img src="/figma/star.svg" alt="" width={14} height={13} />{founder.rating}</a>
          </div>
          <div className="coach-body">
            <ul className="tags">
              <li className="tag tag-sky">{founder.tags[0]}</li>
              <li className="tag tag-sun">{founder.tags[1]}</li>
              <li className="tag tag-violet">{founder.tags[2]}</li>
            </ul>
            <div>
              <h3 className="coach-name">{site.owner.name}</h3>
              <p className="coach-role">{founder.role}</p>
            </div>
            <blockquote><span className="bubble" aria-hidden>💬</span>{founder.quote}</blockquote>
            <div className="founder-links">
              <a className="btn btn-wa" href={whatsappLink()} target="_blank" rel="noopener noreferrer"><WhatsApp /> Connect on WhatsApp</a>
              <a className="btn btn-white" href={site.owner.linkedinUrl} target="_blank" rel="noopener noreferrer">Connect on LinkedIn <ExternalLink size={14} aria-hidden /></a>
            </div>
            <dl className="quick">
              {founder.stats.map((s, i) => <div key={s.label} className={`quick-${i}`}><dd>{s.value}</dd><dt>{s.label}</dt></div>)}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Reviews() {
  return (
    <section id="reviews" className="sec sec-white">
      <div className="wrap stack">
        <Head pill={reviews.eyebrow} title={reviews.title} />
        <div className="banner-rate">
          <div className="rate-l">
            <span className="icon-box icon-white" aria-hidden>💛</span>
            <div><h3>{reviews.banner.title} <span className="stars" role="img" aria-label="5 out of 5 stars">★★★★★</span></h3><p>{reviews.banner.sub}</p></div>
          </div>
          <a className="btn btn-white btn-sm" href={site.reviewsSourceUrl} target="_blank" rel="noopener noreferrer">{reviews.all} <ExternalLink size={14} aria-hidden /></a>
        </div>
        <ul className="rev-list" aria-label="Parent reviews">
          {reviews.list.map((r, i) => (
            <li key={r.url}>
              <article className={`review tone-${(['sun', 'sky', 'violet'] as const)[i % 3]}`}>
                <span className="stars" role="img" aria-label="5 out of 5 stars">★★★★★</span>
                <blockquote>“{r.text}”</blockquote>
                <span className="who"><b>{r.name}</b><span>{r.date} · <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Read ${r.name}’s review on Trustpilot`}>Read on Trustpilot</a></span></span>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <>
      <div className="foot-clear"> {/* room under the footer so the floating Book button never covers it */}
        <SiteFooter id="contact" />
      </div>
      <FloatBook />
    </>
  );
}
