import shield from './shield.svg';
import './site-footer.css';

const SUPPORT_EMAIL = 'pprincyaaghaww@quanttoria.com';
// The legal pages live on the public website. The apps point there with `homeUrl` (or NEXT_PUBLIC_HOME_URL baked at build); the website itself uses relative links.
const LINKS = [
  ['Privacy Policy', '/privacy'],
  ['Parental Consent & Rights', '/privacy#parental-consent'],
  ['Student Data Safety', '/privacy#student-data'],
  ['Terms of Use', '/terms'],
];

/**
 * The footer of the public site and the sign-in pages: a support email line, then links to the privacy and terms pages.
 */
export function SiteFooter({ id, homeUrl }: { id?: string; homeUrl?: string }) {
  const HOME = (homeUrl ?? process.env.NEXT_PUBLIC_HOME_URL ?? '').replace(/\/$/, '');
  return (
    <footer className="sf" id={id}>
      <div className="sf-in">
        <div className="sf-copy">
          <img src={shield.src} alt="" width={13} height={17} aria-hidden />
          <div>
            <b>COPPA &amp; FERPA Compliant Security</b>
            <p>Zero third-party student trackers. Encrypted end-to-end learning environment.</p>
          </div>
        </div>
        <div className="sf-links">
          <div className="sf-contact">For support, mail us at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></div>
          <nav aria-label="Legal">
            {LINKS.map(([label, path]) => <a key={label} href={`${HOME}${path}`}>{label}</a>)}
          </nav>
          <small>&copy; {new Date().getFullYear()} Quanttoria Inc.</small>
        </div>
      </div>
    </footer>
  );
}
