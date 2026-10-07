import type { Metadata } from 'next';
import { Fredoka, Plus_Jakarta_Sans } from 'next/font/google';
import { BRAND } from '@/content/site';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-jakarta' });
const fredoka = Fredoka({ subsets: ['latin'], display: 'swap', variable: '--font-fredoka' });

export const metadata: Metadata = {
  title: `${BRAND}: 1:1 online math tutoring, Grades 1–10`,
  description: 'Dedicated 1:1 math coaches who teach the “why”, building confidence and resilience. Book a free 45-minute diagnostic evaluation.',
  openGraph: { title: `${BRAND}: Confidence Unlocked`, description: '1:1 online math tutoring for Grades 1–10.', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fredoka.variable}`}>
      <body>{children}</body>
    </html>
  );
}
