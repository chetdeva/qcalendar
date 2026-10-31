import Image from 'next/image';
import type { ReactNode } from 'react';
import { SiteFooter } from '@components/site-footer';
import { BRAND } from '@/content/site';

/** Shell for the privacy and terms pages: logo back to the home page, readable column, the shared footer. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div id="top">
      <header className="top">
        <div className="wrap top-in">
          <a className="logo" href="/" aria-label={`${BRAND} home`}><Image src="/images/quanttoria-mark.png" alt="" width={40} height={38} /><b>{BRAND}</b></a>
        </div>
      </header>
      <main className="wrap legal">
        <h1>{title}</h1>
        <p className="legal-updated">Last updated {updated}</p>
        {children}
      </main>
      <SiteFooter id="contact" />
    </div>
  );
}
