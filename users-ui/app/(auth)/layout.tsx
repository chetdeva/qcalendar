import { SiteFooter } from '@components/site-footer';
import { homeUrl } from '@/lib/env';
import { HelpBanner } from './_parts/help-banner';
import { Story } from './_parts/story';
import { TopBar } from './_parts/top-bar';
import './auth.css';

/** The shared frame of every sign-in page: top bar, story column, the page's own card, help banner and footer. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="au-page">
      <TopBar />
      <main className="au-main">
        <div className="au-glow au-glow-a" aria-hidden />
        <div className="au-glow au-glow-b" aria-hidden />
        <div className="au-glow au-glow-c" aria-hidden />
        <div className="au-board">
          <div className="au-grid">
            <Story />
            <div className="au-right">{children}</div>
          </div>
          <HelpBanner />
        </div>
      </main>
      <SiteFooter homeUrl={homeUrl} />
    </div>
  );
}
