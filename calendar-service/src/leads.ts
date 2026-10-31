import type { Actor } from './auth.ts';
import { requireAdmin } from './admin.ts';
import { HttpError } from './errors.ts';
import type { Ctx } from './events.ts';
import { enqueueLeadMail } from './outbox.ts';

export const DEFAULT_LEADS_TO = 'pprincyaaghaww@quanttoria.com';

export interface LeadInput {
  parentName: string; email: string; phone?: string; grade: string; goal?: string; timeZone?: string; source?: string; page?: string;
}

/**
 * Saves a free-class request from the website and queues two emails: one to the teacher, one confirming to the parent.
 * The same email twice on one (UTC) day is one request, so a double click sends nothing new.
 */
export async function createLead(ctx: Ctx, actor: Actor, input: LeadInput) {
  if (actor.kind !== 'service') throw new HttpError(403, 'forbidden', 'Only the website backend may submit requests');
  const email = input.email.trim();
  return ctx.db.tx(async (q) => {
    await q.query('select pg_advisory_xact_lock(hashtext($1))', [`lead:${email.toLowerCase()}`]);
    const dup = await q.query(
      `select 1 from calendar.leads where lower(email) = lower($1) and (created_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date`, [email]);
    if (dup.length) return { duplicate: true };
    await q.query(
      'insert into calendar.leads (parent_name, email, phone, grade, goal, time_zone, source, page) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [input.parentName, email, input.phone ?? null, input.grade, input.goal ?? null, input.timeZone ?? null, input.source ?? null, input.page ?? null]);
    await enqueueLeadMail(q, { ...input, email }, ctx.leadsTo || DEFAULT_LEADS_TO);
    return { duplicate: false };
  });
}

interface Row {
  id: string; created_at: Date | string; parent_name: string; email: string; phone: string | null; grade: string; goal: string | null;
  time_zone: string | null; source: string | null; page: string | null; status: string;
}

/** The website requests, newest first, a page at a time. */
export async function listLeads(ctx: Ctx, actor: Actor, page: { limit: number; offset: number }) {
  requireAdmin(actor);
  const rows = await ctx.db.query<Row>('select * from calendar.leads order by created_at desc, id desc limit $1 offset $2', [page.limit, page.offset]);
  const [{ n }] = await ctx.db.query<{ n: number }>('select count(*)::int as n from calendar.leads');
  return {
    total: n,
    leads: rows.map((r) => ({
      id: Number(r.id), createdAt: new Date(r.created_at).toISOString(), parentName: r.parent_name, email: r.email, phone: r.phone, grade: r.grade,
      goal: r.goal, timeZone: r.time_zone, source: r.source, page: r.page, status: r.status,
    })),
  };
}
