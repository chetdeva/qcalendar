import mark from '@components/quanttoria-mark.png';
import { homeUrl, whatsappLink } from '@/lib/env';

export function TopBar() {
  return (
    <header className="au-top">
      <div className="au-top-in">
        <a className="au-brand" href={homeUrl} aria-label="Quanttoria home">
          <img src={mark.src} alt="" width={32} height={30} />
          <b>Quanttoria</b>
        </a>
        <nav className="au-top-nav" aria-label="Help">
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer">Need help? / Parent Support</a>
        </nav>
        <a className="au-demo" href={`${homeUrl}/#book`}>Book Free Demo</a>
      </div>
    </header>
  );
}
