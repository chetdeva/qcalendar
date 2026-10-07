import type { Metadata } from 'next';
import { Fredoka, Plus_Jakarta_Sans } from 'next/font/google';
import { BRAND } from '@/content/site';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-jakarta' });
const fredoka = Fredoka({ subsets: ['latin'], display: 'swap', variable: '--font-fredoka' });

export const metadata: Metadata = {
  title: `${BRAND} | Personalized Learning for US Students`,
  description: 'Private, one-to-one online maths coaching for Grades 1-10. Help your child build understanding, analysis, problem-solving strategies and confidence across global maths curricula.',
  keywords: ['maths coaching for children', 'one-to-one maths classes', 'US Common Core maths', 'AP maths support', BRAND],
  openGraph: { title: `${BRAND} | Personalized Learning for US Students`, description: 'Patient, personalised maths coaching that helps children move from confusion to understanding and confidence.', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fredoka.variable}`}>
      <body>{children}</body>
    </html>
  );
}
