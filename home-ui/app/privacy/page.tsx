import type { Metadata } from 'next';
import LegalPage from '@/components/LegalPage';
import { site } from '@/content/site';

export const metadata: Metadata = {
  title: 'Privacy Policy | Quanttoria',
  description: 'What Quanttoria collects when you book a free class, how it is used, and how we protect children’s information.',
  alternates: { canonical: '/privacy' },
};

export default function Privacy() {
  const email = site.emails[0];
  return (
    <LegalPage title="Privacy Policy" updated="October 31, 2026">
      <p>Quanttoria provides private one-to-one online math tutoring. This page explains what we collect, why, and what you can ask us to do. We wrote it in plain language; questions go to <a href={`mailto:${email}`}>{email}</a>.</p>

      <h2>What we collect</h2>
      <ul>
        <li><b>When you request a free class:</b> the parent’s name, email address and optional phone number, your child’s grade level, your goal and your time zone.</li>
        <li><b>When you take classes:</b> your child’s name, grade, lesson schedule, messages between you and the teacher, assignments and feedback.</li>
        <li><b>On this website:</b> simple, cookie-free visit counts (which page, which link brought you here) so we can see what helps families find us. No advertising trackers and no third-party student trackers.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To reply to your request, schedule the free class and teach your child.</li>
        <li>To email you about classes (confirmations, reminders, changes) and progress.</li>
        <li>To keep the service safe and fix problems. We do not sell your information and we do not use children’s information for advertising.</li>
      </ul>

      <h2 id="parental-consent">Parental consent and rights</h2>
      <p>Our service is for parents and guardians to book on behalf of a child. We ask for a child’s information only from a parent or guardian, and only what is needed to teach. A parent can at any time ask to see, correct or delete their child’s information, or to stop us using it, by emailing <a href={`mailto:${email}`}>{email}</a>. We reply within 30 days.</p>

      <h2 id="student-data">Student data safety</h2>
      <ul>
        <li>Information is sent over encrypted connections and stored with reputable cloud providers (database, email and file storage).</li>
        <li>Only the teacher and Quanttoria staff who need it to run your child’s classes can see it.</li>
        <li>Classes are live one-to-one sessions; recordings are not made available publicly.</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>Only the service providers that run Quanttoria for us (hosting, database, email delivery, payments, video meetings, and cookie-free website analytics), and only to provide the service. We may share information if the law requires it.</p>

      <h2>How long we keep it</h2>
      <p>Free-class requests that do not lead to classes are deleted after 12 months. Information about enrolled students is kept while the account is active and for a reasonable period afterwards, unless you ask us to delete it sooner.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will update the date above and, for current families, tell you by email.</p>
    </LegalPage>
  );
}
