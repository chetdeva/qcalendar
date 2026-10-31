import Image from 'next/image';
import { SiteFooter } from '@components/site-footer';
import FloatBook from './FloatBook';
import BookingForm from './BookingForm';
import { BRAND, SITE_URL, faq as homeFaq, pricing } from '@/content/site';
import { pages, type SeoPageData } from '@/content/pages';

const ld = (data: object) => <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;

/** One landing page (grade band or goal), built from content/pages.ts. */
export default function SeoPage({ p }: { p: SeoPageData }) {
  const plan = p.plan === undefined ? undefined : pricing.plans[p.plan];
  const others = pages.filter((x) => x.slug !== p.slug);
  return (
    <div id="top">
      {ld({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) },
          { '@type': 'BreadcrumbList', itemListElement: [{ name: BRAND, path: '' }, { name: p.short, path: `/math-tutoring/${p.slug}` }].map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: `${SITE_URL}${b.path || '/'}` })) },
        ],
      })}
      <header className="top">
        <div className="wrap top-in">
          <a className="logo" href="/" aria-label={`${BRAND} home`}><Image src="/images/quanttoria-mark.png" alt="" width={40} height={38} /><b>{BRAND}</b></a>
          <a className="btn btn-primary" href="#book">Book a free class</a>
        </div>
      </header>
      <main>
        <section className="wrap legal seo">
          <h1>{p.h1}</h1>
          <p className="lede">{p.intro}</p>
          <h2>Who this is for</h2>
          <ul>{p.who.map((w) => <li key={w}>{w}</li>)}</ul>
          <h2>What a class looks like</h2>
          <ol>{p.lesson.map((l) => <li key={l}>{l}</li>)}</ol>
          <h2>Cost</h2>
          <p>{plan ? `${p.short}: ${plan.monthly} a month for 15 one-hour classes (${plan.perClass} each). ` : ''}{pricing.note}</p>
          <h2>Questions parents ask</h2>
          <dl>{[...p.faq, homeFaq[0]].map((f) => <div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>)}</dl>
          <h2>More ways we help</h2>
          <ul className="seo-links">{others.map((o) => <li key={o.slug}><a href={`/math-tutoring/${o.slug}`}>{o.short}</a></li>)}</ul>
        </section>
        <BookingForm />
      </main>
      <div className="foot-clear"><SiteFooter id="contact" /></div>
      <FloatBook />
    </div>
  );
}
