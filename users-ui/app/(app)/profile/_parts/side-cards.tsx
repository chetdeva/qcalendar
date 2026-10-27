import Link from 'next/link';
import type { Me } from '@/lib/me';
import { chatUrl, whatsappLink } from '@/lib/env';
import { BotIcon, ChatIcon, LockIcon, ShieldIcon, UsersIcon } from './icons';

/** The right-hand column. Anything the app cannot back with real data is left out or shown as "Coming soon". */
export function SideCards({ me }: { me: Me }) {
  const student = me.role === 'student';
  return (
    <aside className="pf-side" aria-label="More about your account">
      <section className="pf-card">
        <h2>Security &amp; Trust <span className="pf-round"><LockIcon size={18} /></span></h2>
        <p>Quanttoria complies with student identity protection protocols under US educational standards.</p>
        <p className="pf-row"><span><ShieldIcon size={18} /> FERPA &amp; COPPA</span><b className="pf-ok">Compliant</b></p>
        <Link className="pf-wide" href="/forgot-password">Reset my password</Link>
      </section>

      {student && (
        <section className="pf-card">
          <h2><span><UsersIcon size={20} /> Linked Parent Account</span>{me.guardian_email && <b className="pf-ok">Connected</b>}</h2>
          <p>{me.guardian_email ?? 'No guardian email yet. Add one in your details to link a parent.'}</p>
        </section>
      )}

      <section className="pf-card">
        <h2>{student ? 'Need Math Help?' : 'Need Assistance?'}</h2>
        <p>{student ? 'Stuck on a tricky homework quest or prep problem?' : 'Having trouble matching student calendar zones or re-verifying credentials?'}</p>
        {student && <button type="button" className="pf-cta" disabled title="Coming soon"><BotIcon size={18} /> Ask AI Math Tutor <small>Soon</small></button>}
        {student
          ? <a className="pf-wide" href={chatUrl || '#'}><ChatIcon size={18} /> Message your coach</a>
          : <a className="pf-cta" href={whatsappLink} target="_blank" rel="noopener noreferrer"><ChatIcon size={18} /> Chat with School Operations</a>}
      </section>
    </aside>
  );
}
