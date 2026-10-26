import type { ReactNode } from 'react';
import { Icon } from './img';

/** The big blue button with its darker bottom edge and an arrow. */
export function Submit({ busy, children }: { busy: boolean; children: ReactNode }) {
  return <button type="submit" className="au-submit" disabled={busy}>{children} <Icon name="arrow" width={15} height={15} /></button>;
}
