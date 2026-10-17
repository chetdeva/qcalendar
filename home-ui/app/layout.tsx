import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { BRAND } from '@/content/site';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['500', '600', '700', '800'], style: ['normal', 'italic'], display: 'swap', variable: '--font-jakarta' });

export const metadata: Metadata = {
  title: `${BRAND} | Personalized Learning for US Students`,
  description: 'Private, one-to-one online maths coaching for Grades 1-10. Help your child build understanding, analysis, problem-solving strategies and confidence across global maths curricula.',
  keywords: ['maths coaching for children', 'one-to-one maths classes', 'US Common Core maths', 'AP maths support', BRAND],
  openGraph: { title: `${BRAND} | Personalized Learning for US Students`, description: 'Patient, personalised maths coaching that helps children move from confusion to understanding and confidence.', type: 'website' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
