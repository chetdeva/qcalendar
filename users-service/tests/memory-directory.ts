import { randomUUID } from 'node:crypto';
import type { Role } from '../src/auth.ts';
import { DirectoryError, type Directory, type Invitation, type Profile, type ProfilePatch, type ProfileQuery, type Status } from '../src/directory.ts';

/** In-memory Directory that enforces the same rules as the database (last admin, one pending invite per email). */
export class MemoryDirectory implements Directory {
  profiles = new Map<string, Profile>();
  invitations: Invitation[] = [];
  banned = new Set<string>();
  sentInvites: { email: string; redirectTo: string }[] = [];
  confirmedEmails = new Set<string>();
  failInvites = false;

  addProfile(p: Partial<Profile> & { email: string }): Profile {
    const now = new Date(Date.now() - this.profiles.size * 1000).toISOString();
    const profile: Profile = {
      id: randomUUID(), full_name: null, role: 'student', status: 'active', timezone: null, guardian_email: null,
      created_at: now, updated_at: now, ...p,
    };
    this.profiles.set(profile.id, profile);
    return profile;
  }

  async getProfile(id: string) { return this.profiles.get(id) ?? null; }
  async findProfileByEmail(email: string) { return [...this.profiles.values()].find((p) => p.email.toLowerCase() === email.toLowerCase()) ?? null; }

  async listProfiles(q: ProfileQuery) {
    const term = q.search?.toLowerCase();
    return [...this.profiles.values()]
      .filter((p) => (!q.role || p.role === q.role) && (!q.status || p.status === q.status))
      .filter((p) => !term || p.email.toLowerCase().includes(term) || (p.full_name ?? '').toLowerCase().includes(term))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(q.offset, q.offset + q.limit);
  }

  async updateProfile(id: string, patch: ProfilePatch) {
    const p = this.profiles.get(id);
    if (!p) return null;
    Object.assign(p, patch, { updated_at: new Date().toISOString() });
    return p;
  }

  private guardLastAdmin(p: Profile, next: { role?: Role; status?: Status }) {
    const losing = p.role === 'admin' && p.status === 'active' && ((next.role && next.role !== 'admin') || next.status === 'disabled');
    const others = [...this.profiles.values()].some((x) => x.id !== p.id && x.role === 'admin' && x.status === 'active');
    if (losing && !others) throw new DirectoryError('last_admin', 'cannot demote or disable the last active admin');
  }

  async setRole(id: string, role: Role) {
    const p = this.profiles.get(id);
    if (!p) return null;
    this.guardLastAdmin(p, { role });
    p.role = role;
    return p;
  }

  async setStatus(id: string, status: Status) {
    const p = this.profiles.get(id);
    if (!p) return null;
    this.guardLastAdmin(p, { status });
    p.status = status;
    return p;
  }

  async setBanned(id: string, banned: boolean) { if (banned) this.banned.add(id); else this.banned.delete(id); }

  async createInvitation(input: { email: string; role: Role; invitedBy: string }) {
    const now = Date.now();
    for (const i of this.invitations) {
      if (i.email === input.email && i.status === 'pending' && Date.parse(i.expires_at) <= now) i.status = 'revoked';
    }
    if (this.invitations.some((i) => i.email === input.email && i.status === 'pending')) throw new DirectoryError('invitation_pending', 'pending');
    const inv: Invitation = {
      id: randomUUID(), email: input.email, role: input.role, invited_by: input.invitedBy, status: 'pending',
      created_at: new Date(now).toISOString(), expires_at: new Date(now + 14 * 86_400_000).toISOString(), accepted_at: null,
    };
    this.invitations.push(inv);
    return inv;
  }

  async listInvitations(status?: Invitation['status']) { return this.invitations.filter((i) => !status || i.status === status); }

  async revokeInvitation(id: string) {
    const inv = this.invitations.find((i) => i.id === id && i.status === 'pending');
    if (!inv) return null;
    inv.status = 'revoked';
    return inv;
  }

  async sendInviteEmail(email: string, redirectTo: string) {
    if (this.failInvites) throw new DirectoryError('upstream', 'smtp down');
    if (this.confirmedEmails.has(email.toLowerCase())) throw new DirectoryError('email_exists', 'exists');
    this.sentInvites.push({ email, redirectTo });
  }
}
