import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { BRAND, SITE_URL } from '@/content/site';
import Script from 'next/script';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['500', '600', '700', '800'], style: ['normal', 'italic'], display: 'swap', variable: '--font-jakarta' });

const title = `Online Math Tutor for Kids, Grades 1-10 | ${BRAND}`;
const description = 'Private 1-on-1 online math tutoring for kids in Grades 1-10: Common Core help, math anxiety, Olympiad prep and school homework. Your first class is free.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: { title, description, type: 'website', url: '/', siteName: BRAND, locale: 'en_US' },
  twitter: { card: 'summary_large_image', title, description },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>
        {children}
        {process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN && <Script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon={JSON.stringify({ token: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN })} strategy="afterInteractive" />}
      </body>
    </html>
  );
}
