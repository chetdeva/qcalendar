export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailError(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Enter your email address.';
  if (e.length > 254 || !EMAIL.test(e)) return 'Enter a valid email address.';
  return null;
}

/** 8 to 72 characters (72 is the most the password hash looks at) and not just the email address. */
export function passwordError(password: string, email = ''): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password.length > 72) return 'Use at most 72 characters.';
  if (email && password.toLowerCase() === email.trim().toLowerCase()) return 'Your password cannot be your email address.';
  return null;
}

export function nameError(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter your name.';
  if (n.length > 100) return 'Use at most 100 characters.';
  return null;
}
