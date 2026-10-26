import Image from 'next/image';
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Tone } from '@/lib/types';

const TONES: Tone[] = ['sky', 'sun', 'rose', 'mint', 'violet'];
const toneOf = (name: string): Tone => TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];

/** A round avatar: the person's photo when there is one, otherwise their initials on a soft colour. */
export function Avatar({ name, initials, photo, size = 48 }: { name: string; initials: string; photo?: string; size?: number }) {
  if (photo) return <Image className="avatar" src={photo} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  return <span className={`avatar tone-${toneOf(name)}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden>{initials}</span>;
}

/** Something that is designed but not built yet: shown, clearly marked, and not clickable. */
/** An uploaded file: a picture is shown, a PDF is a link that opens it in a new tab. */
export function Attachment({ id, type, alt }: { id: string; type: string | null; alt: string }) {
  const src = `/api/attachments/${id}`;
  return type === 'application/pdf'
    ? <a className="btn-soft pdf" href={src} target="_blank" rel="noopener noreferrer"><FileText size={15} aria-hidden /> Open the PDF</a>
    : <img className="shot" src={src} alt={alt} />;
}

export function Soon({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return <button type="button" className={`${className} soon`} disabled title="Coming soon" aria-label={label ? `${label} (coming soon)` : undefined}>{children}</button>;
}

export function Bar({ pct, tone = 'primary', label }: { pct: number; tone?: 'primary' | 'olive' | 'sun'; label: string }) {
  return <span className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i className={`bar-${tone}`} style={{ width: `${pct}%` }} /></span>;
}
