import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Role } from './auth.ts';
import { DirectoryError, type Directory, type Invitation, type Profile, type ProfilePatch, type ProfileQuery, type Status } from './directory.ts';

// Characters with meaning inside a PostgREST filter string; stripped from free-text search so a search
// term can never add its own filters.
const FILTER_SYNTAX = /[,()%*\\:"']/g;

function fail(error: { code?: string; message: string }): never {
  if (error.code === 'P0001' && /last active admin/.test(error.message)) throw new DirectoryError('last_admin', error.message);
  if (error.code === '23505') throw new DirectoryError('invitation_pending', error.message);
  throw new DirectoryError('upstream', error.message);
}

export class SupabaseDirectory implements Directory {
  db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async getProfile(id: string) {
    const { data, error } = await this.db.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) fail(error);
    return data as Profile | null;
  }

  async findProfileByEmail(email: string) {
    const { data, error } = await this.db.from('profiles').select('*').ilike('email', email.replace(/[%_\\]/g, '\\$&')).maybeSingle();
    if (error) fail(error);
    return data as Profile | null;
  }

  async listProfiles(q: ProfileQuery) {
    let query = this.db.from('profiles').select('*').order('created_at', { ascending: false }).range(q.offset, q.offset + q.limit - 1);
    if (q.role) query = query.eq('role', q.role);
    if (q.status) query = query.eq('status', q.status);
    const term = q.search?.replace(FILTER_SYNTAX, ' ').trim();
    if (term) query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
    const { data, error } = await query;
    if (error) fail(error);
    return (data ?? []) as Profile[];
  }

  async updateProfile(id: string, patch: ProfilePatch) {
    const { data, error } = await this.db.from('profiles').update(patch).eq('id', id).select('*').maybeSingle();
    if (error) fail(error);
    return data as Profile | null;
  }

  async setRole(id: string, role: Role) {
    const { data, error } = await this.db.from('profiles').update({ role }).eq('id', id).select('*').maybeSingle();
    if (error) fail(error);
    return data as Profile | null;
  }

  async setStatus(id: string, status: Status) {
    const { data, error } = await this.db.from('profiles').update({ status }).eq('id', id).select('*').maybeSingle();
    if (error) fail(error);
    return data as Profile | null;
  }

  async setBanned(id: string, banned: boolean) {
    const { error } = await this.db.auth.admin.updateUserById(id, { ban_duration: banned ? '876000h' : 'none' });
    if (error) throw new DirectoryError('upstream', error.message);
  }

  async createInvitation(input: { email: string; role: Role; invitedBy: string }) {
    // An expired invitation is still "pending" in the table and would block a new one; retire it first.
    const expire = await this.db.from('invitations').update({ status: 'revoked' }).ilike('email', input.email).eq('status', 'pending').lte('expires_at', new Date().toISOString());
    if (expire.error) fail(expire.error);
    const { data, error } = await this.db.from('invitations').insert({ email: input.email, role: input.role, invited_by: input.invitedBy }).select('*').single();
    if (error) fail(error);
    return data as Invitation;
  }

  async listInvitations(status?: Invitation['status']) {
    let query = this.db.from('invitations').select('*').order('created_at', { ascending: false }).limit(200);
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) fail(error);
    return (data ?? []) as Invitation[];
  }

  async revokeInvitation(id: string) {
    const { data, error } = await this.db.from('invitations').update({ status: 'revoked' }).eq('id', id).eq('status', 'pending').select('*').maybeSingle();
    if (error) fail(error);
    return data as Invitation | null;
  }

  async sendInviteEmail(email: string, redirectTo: string) {
    const { error } = await this.db.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (!error) return;
    if ((error as { code?: string }).code === 'email_exists' || /already (been )?registered/i.test(error.message)) {
      throw new DirectoryError('email_exists', error.message);
    }
    throw new DirectoryError('upstream', error.message);
  }
}
