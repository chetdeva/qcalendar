'use client';

import { useState } from 'react';
import { Icon } from './img';

/** A labelled input with a leading icon. `reveal` adds the Show/Hide button for passwords. */
export function Field({ id, label, icon, type = 'text', value, onChange, autoComplete, placeholder, hint, reveal, readOnly }: {
  id: string; label: string; icon: 'user' | 'mail' | 'lock'; type?: string; value: string; onChange?: (v: string) => void;
  autoComplete?: string; placeholder?: string; hint?: string; reveal?: boolean; readOnly?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="au-field">
      <label htmlFor={id}>{label}</label>
      <div className="au-input">
        <Icon name={icon} width={icon === 'mail' ? 17 : 14} height={icon === 'lock' ? 18 : 14} className="au-ico" />
        <input id={id} type={reveal && shown ? 'text' : type} value={value} onChange={(e) => onChange?.(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} readOnly={readOnly} />
        {reveal && (
          <button type="button" className="au-eye" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide' : 'Show'} aria-pressed={shown}>
            <Icon name="eye" width={18} height={13} />
          </button>
        )}
      </div>
      {hint && <span className="au-hint">{hint}</span>}
    </div>
  );
}
