import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { site } from '@/content/site';

export const metadata: Metadata = {
  title: 'Terms of Use | Quanttoria',
  description: 'The terms for using the Quanttoria website and booking classes.',
  alternates: { canonical: '/terms' },
};

export default function Terms() {
  const email = site.emails[0];
  return (
    <LegalPage title="Terms of Use" updated="October 31, 2026">
      <p>By using this website or booking a class with Quanttoria you agree to these terms. Questions: <a href={`mailto:${email}`}>{email}</a>.</p>

      <h2>The service</h2>
      <p>Quanttoria offers private one-to-one online math tutoring. The first class is free, with no obligation. Classes are held live online; you need a device with a camera, microphone and a reliable internet connection.</p>

      <h2>Parents and guardians</h2>
      <p>Only a parent or legal guardian may book classes for a child and accept these terms on the child’s behalf. You are responsible for the information you give us being correct.</p>

      <h2>Scheduling, payment and cancellations</h2>
      <p>Class times are agreed with your teacher. Plans and prices are shown before you pay, and payments are handled by our payment provider. Please give notice if you need to change or cancel a class; the details are shown when you subscribe.</p>

      <h2>Results</h2>
      <p>We teach to help your child understand math and build confidence. We cannot promise a specific grade or test result.</p>

      <h2>Reviews</h2>
      <p>The reviews on this site are by parents about classes with our founder at a previous school, shown word for word with a link to the original. They describe those parents’ own experiences.</p>

      <h2>Using the website</h2>
      <p>Please do not misuse the site, try to access other people’s accounts, or copy our content without permission. We may update the site and these terms; the date above shows the latest version.</p>

      <h2>Privacy</h2>
      <p>How we handle your information is described in our <a href="/privacy">Privacy Policy</a>.</p>
    </LegalPage>
  );
}
