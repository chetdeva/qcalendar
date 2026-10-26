import type { ReactNode } from 'react';

/** Designed but not built yet: shown, clearly marked, and not clickable (same idea as the dashboard's Soon). */
export function Soon({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <button type="button" className={`au-soon ${className}`} disabled title="Coming soon">{children}</button>;
}
