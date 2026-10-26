import shield from './shield.svg';
import './site-footer.css';

const SUPPORT_EMAIL = 'pprincyaaghaww@quanttoria.com';
const LINKS = ['Privacy Policy', 'Parental Consent & Rights', 'Student Data Safety'];

/**
 * The footer of the public site and the sign-in pages. The legal pages are not built yet, so those links are
 * shown but disabled. A support email line sits above them.
 */
export function SiteFooter({ id }: { id?: string }) {
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
            {LINKS.map((l) => <button key={l} type="button" disabled title="Coming soon">{l}</button>)}
          </nav>
          <small>&copy; {new Date().getFullYear()} Quanttoria Inc.</small>
        </div>
      </div>
    </footer>
  );
}
