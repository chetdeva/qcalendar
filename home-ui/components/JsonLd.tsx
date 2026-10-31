import { BRAND, SITE_URL, site } from '@/content/site';

/** Structured data for Google and AI assistants: who Quanttoria is, who teaches, and how they relate. */
export default function JsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalOrganization',
        '@id': `${SITE_URL}/#org`,
        name: BRAND,
        url: SITE_URL,
        logo: `${SITE_URL}/images/quanttoria-logo.png`,
        description: 'Private 1-on-1 online math tutoring for kids in Grades 1-10: Common Core, math anxiety, Olympiad prep and school homework.',
        email: site.emails[0],
        founder: { '@id': `${SITE_URL}/#teacher` },
        areaServed: { '@type': 'Country', name: 'United States' },
      },
      {
        '@type': 'Person',
        '@id': `${SITE_URL}/#teacher`,
        name: site.owner.name,
        jobTitle: site.owner.role,
        worksFor: { '@id': `${SITE_URL}/#org` },
        sameAs: [site.owner.linkedinUrl],
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}
