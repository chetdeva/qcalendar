import { whatsappLink } from '@/lib/env';
import { Icon } from './img';
import { Soon } from './soon';

export function HelpBanner() {
  return (
    <section className="au-help" aria-label="Parent help">
      <div className="au-help-text">
        <Icon name="headset" width={23} height={21} />
        <div>
          <h2>Have questions about your child&rsquo;s math plan?</h2>
          <p>Message us on WhatsApp, or ask your child&rsquo;s coach once you are signed up.</p>
        </div>
      </div>
      <div className="au-help-btns">
        <a className="au-wa" href={whatsappLink} target="_blank" rel="noopener noreferrer"><img src="/images/auth/whatsapp-glyph-white.png" alt="" width={20} height={20} aria-hidden /> Connect on WhatsApp</a>
        <Soon className="au-pill au-pill-sun">Call us</Soon>
      </div>
    </section>
  );
}
