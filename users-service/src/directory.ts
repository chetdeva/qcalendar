import type { Role } from './auth.ts';

export type Status = 'active' | 'disabled';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: Status;
  timezone: string | null;
  guardian_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  invited_by: string | null;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface ProfileQuery {
  search?: string;
  role?: Role;
  status?: Status;
  limit: number;
  offset: number;
}

export interface ProfilePatch {
  full_name?: string | null;
  timezone?: string | null;
  guardian_email?: string | null;
}

/**
 * Everything users-service needs from the identity store. SupabaseDirectory implements it against the real
 * project; MemoryDirectory (tests) mirrors the database rules, including the last-admin guard.
 */
export interface Directory {
  getProfile(id: string): Promise<Profile | null>;
  findProfileByEmail(email: string): Promise<Profile | null>;
  listProfiles(q: ProfileQuery): Promise<Profile[]>;
  updateProfile(id: string, patch: ProfilePatch): Promise<Profile | null>;
  setRole(id: string, role: Role): Promise<Profile | null>;
  setStatus(id: string, status: Status): Promise<Profile | null>;
  /** Blocks (or unblocks) sign-in at the auth layer, so a disabled user cannot refresh their session. */
  setBanned(id: string, banned: boolean): Promise<void>;

  createInvitation(input: { email: string; role: Role; invitedBy: string }): Promise<Invitation>;
  listInvitations(status?: Invitation['status']): Promise<Invitation[]>;
  revokeInvitation(id: string): Promise<Invitation | null>;
  /** Sends the invitation email. Throws DirectoryError('email_exists') when the address already has an account. */
  sendInviteEmail(email: string, redirectTo: string): Promise<void>;
}

export class DirectoryError extends Error {
  code: 'email_exists' | 'last_admin' | 'invitation_pending' | 'upstream';
  constructor(code: DirectoryError['code'], message: string) {
    super(message);
    this.code = code;
  }
}
