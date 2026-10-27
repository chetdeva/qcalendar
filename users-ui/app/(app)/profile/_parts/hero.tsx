import type { Me } from '@/lib/me';
import { AvatarEditor } from './avatar-editor';
import { CapIcon, ShieldIcon } from './icons';

const initialsOf = (s: string) => s.split(/[\s@.]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
const ROLE: Record<Me['role'], string> = { student: 'Student', teacher: 'Teacher', admin: 'Admin' };

/** Who is signed in: avatar, name, role and email. The Figma stat chips are left out (no data behind them). */
export function Hero({ me }: { me: Me }) {
  const name = me.full_name || me.email;
  return (
    <section className="pf-hero" aria-label="Your account">
      <i className="pf-blob pf-blob-a" aria-hidden /><i className="pf-blob pf-blob-b" aria-hidden />
      <div className="pf-who">
        <AvatarEditor initials={initialsOf(name)} avatar={me.avatar_updated_at} />
        <div>
          <p className="pf-name"><b>{name}</b><span className="pf-pill">{me.role === 'student' ? <CapIcon size={15} /> : <ShieldIcon size={15} />}{ROLE[me.role]}</span></p>
          <p className="pf-sub">{me.email} <i aria-hidden>•</i> <code>Role: {ROLE[me.role]}</code></p>
        </div>
      </div>
    </section>
  );
}
