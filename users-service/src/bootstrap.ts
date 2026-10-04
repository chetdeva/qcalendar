import type { Directory } from './directory.ts';

/** Makes an existing account an admin. The very first admin has to be created this way (see README). */
export async function makeAdmin(directory: Directory, email: string) {
  const profile = await directory.findProfileByEmail(email);
  if (!profile) throw new Error(`No account for ${email}. Sign up first (users-ui, or the Supabase dashboard), then run this again.`);
  if (profile.role === 'admin') return profile;
  const updated = await directory.setRole(profile.id, 'admin');
  if (!updated) throw new Error('Profile vanished while promoting');
  return updated;
}
