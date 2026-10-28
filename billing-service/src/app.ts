import { Hono } from 'hono';
import { z } from 'zod';
import type { Actor, Authenticator } from './auth.ts';
import { balance, release, reserve } from './credits.ts';
import type { Db } from './db.ts';
import { HttpError } from './errors.ts';
import type { PaymentGateway } from './gateway.ts';
import { getPlan, planForGrade, priceCents, type Plan } from './plans.ts';
import { applyEvent, gradeChanged } from './subscriptions.ts';

/** Where a student's grade comes from (users-service). */
export interface UsersClient {
  grade(userId: string): Promise<number | null>;
}

export interface AppDeps {
  db: Db;
  authenticator: Authenticator;
  /** Every gateway we still receive webhooks from (two during a switch). */
  gateways: Record<string, PaymentGateway>;
  /** The one used for new checkouts. */
  defaultGateway: string;
  users: UsersClient;
  /** Where the hosted pages send people back to (the billing page in users-ui). */
  returnUrl: string;
}

type Env = { Variables: { actor: Actor } };

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid request', r.error.issues);
  return r.data;
}

const uuid = z.uuid();
const ReserveBody = z.object({ userId: uuid, ref: z.string().min(1).max(200), endsAt: z.string().datetime({ offset: true }).optional() }).strict();
const GradeBody = z.object({ userId: uuid, grade: z.number().int().min(1).max(10) }).strict();
const CheckoutBody = z.object({ interval: z.enum(['month', 'year']) }).strict();

export function createApp(d: AppDeps): Hono<Env> {
  const app = new Hono<Env>();
  const gw = () => d.gateways[d.defaultGateway]!;

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    console.error('unhandled error:', err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  // Gateways call this directly (no login); the adapter verifies the signature.
  app.post('/v1/webhooks/:gateway', async (c) => {
    const g = d.gateways[c.req.param('gateway')];
    if (!g) throw new HttpError(404, 'not_found', 'Unknown gateway');
    const event = g.parseWebhook({ rawBody: await c.req.text(), headers: Object.fromEntries(c.req.raw.headers) });
    return c.json({ result: event ? await applyEvent(d.db, event) : 'ignored' });
  });

  app.use('/v1/*', async (c, next) => {
    c.set('actor', await d.authenticator.authenticate(c.req.header('authorization')));
    await next();
  });
  const service = (c: { get(k: 'actor'): Actor }) => {
    if (c.get('actor').kind !== 'service') throw new HttpError(403, 'forbidden', 'Service access only');
  };
  const person = (c: { get(k: 'actor'): Actor }) => {
    const a = c.get('actor');
    if (a.kind !== 'user') throw new HttpError(403, 'forbidden', 'Sign in as a person');
    return a;
  };

  // --- called by calendar-service and users-service -------------------------------------------------------------
  app.post('/v1/service/credits/reserve', async (c) => {
    service(c);
    const b = parse(ReserveBody, await c.req.json().catch(() => null));
    const r = await reserve(d.db, b.userId, b.ref, new Date(), b.endsAt ? new Date(b.endsAt) : undefined);
    return r.ok ? c.json(r) : c.json({ error: { code: r.code, message: 'This student cannot book another lesson right now' } }, 402);
  });
  app.post('/v1/service/credits/release', async (c) => {
    service(c);
    const b = parse(ReserveBody, await c.req.json().catch(() => null));
    await release(d.db, b.userId, b.ref);
    return c.body(null, 204);
  });
  app.post('/v1/service/grade-changed', async (c) => {
    service(c);
    const b = parse(GradeBody, await c.req.json().catch(() => null));
    const [sub] = await d.db.query<{ gateway: string }>(`select gateway from billing.subscriptions where user_id = $1 and status in ('active', 'past_due')`, [b.userId]);
    return c.json(await gradeChanged(d.db, d.gateways[sub?.gateway ?? d.defaultGateway] ?? gw(), b.userId, b.grade));
  });

  // --- the signed-in student ------------------------------------------------------------------------------------
  app.get('/v1/billing/me', async (c) => {
    const me = person(c);
    const grade = await d.users.grade(me.id);
    const plan = grade ? await planForGrade(d.db, grade) : undefined;
    const [sub] = await d.db.query<{ status: string; plan_key: string; next_plan_key: string | null; interval: 'month' | 'year'; current_period_end: Date; cancel_at_period_end: boolean }>(
      'select status, plan_key, next_plan_key, interval, current_period_end, cancel_at_period_end from billing.subscriptions where user_id = $1 order by created_at desc limit 1',
      [me.id],
    );
    const [trialRow] = await d.db.query<{ lesson_end: Date | null }>('select lesson_end from billing.trials where user_id = $1', [me.id]);
    const trial = !trialRow ? 'available' : trialRow.lesson_end && trialRow.lesson_end > new Date() ? 'booked' : 'done';
    const live = sub && sub.status !== 'canceled';
    // What to nudge the student toward, decided here so every app shows the same thing. (Whether a free class has been
    // *requested* lives in calendar-service; the apps add that state themselves.)
    const prompts = live ? [] : sub ? ['subscribe'] : trial === 'available' ? ['book_trial', 'subscribe'] : trial === 'booked' ? ['trial_booked'] : ['subscribe'];
    const bands = (await d.db.query<Plan>('select * from billing.plans order by min_grade')).map((p) => ({
      key: p.key, label: p.min_grade === p.max_grade ? `Grade ${p.min_grade}` : `Grades ${p.min_grade}-${p.max_grade}`,
      monthlyCents: priceCents(p, 'month'), annualCents: priceCents(p, 'year'), yours: p.key === plan?.key,
    }));
    const next = sub?.next_plan_key ? await getPlan(d.db, sub.next_plan_key) : undefined;
    return c.json({
      grade,
      plan: plan && { key: plan.key, monthlyCents: priceCents(plan, 'month'), annualCents: priceCents(plan, 'year'), creditsPerMonth: plan.credits_per_month },
      subscription: sub && {
        status: sub.status, planKey: sub.plan_key, interval: sub.interval, periodEnd: sub.current_period_end, cancelAtPeriodEnd: sub.cancel_at_period_end,
        pendingPlan: next && { key: next.key, cents: priceCents(next, sub.interval), from: sub.current_period_end },
      },
      credits: await balance(d.db, me.id),
      trialAvailable: !sub && trial === 'available',
      trial,
      prompts,
      bands,
    });
  });

  app.post('/v1/billing/checkout', async (c) => {
    const me = person(c);
    const { interval } = parse(CheckoutBody, await c.req.json().catch(() => null));
    const grade = await d.users.grade(me.id);
    const plan = grade ? await planForGrade(d.db, grade) : undefined;
    if (!plan) throw new HttpError(409, 'grade_required', 'Ask an admin to set your grade before subscribing');
    const [live] = await d.db.query(`select 1 from billing.subscriptions where user_id = $1 and status in ('active', 'past_due')`, [me.id]);
    if (live) throw new HttpError(409, 'already_subscribed', 'You already have a subscription');
    return c.json(await gw().createCheckout({ userId: me.id, email: me.email, planKey: plan.key, interval, amountCents: priceCents(plan, interval), successUrl: `${d.returnUrl}?checkout=success`, cancelUrl: `${d.returnUrl}?checkout=cancelled` }));
  });

  const ownSubscription = async (userId: string) => {
    const [s] = await d.db.query<{ gateway: string; gateway_ref: string }>(`select gateway, gateway_ref from billing.subscriptions where user_id = $1 and status in ('active', 'past_due')`, [userId]);
    return s;
  };

  app.post('/v1/billing/portal', async (c) => {
    const me = person(c);
    const [cust] = await d.db.query<{ gateway: string; gateway_ref: string }>('select gateway, gateway_ref from billing.customers where user_id = $1 limit 1', [me.id]);
    if (!cust) throw new HttpError(404, 'not_found', 'No billing account yet');
    return c.json(await d.gateways[cust.gateway]!.createPortalSession({ customerRef: cust.gateway_ref, returnUrl: d.returnUrl }));
  });

  app.post('/v1/billing/cancel', async (c) => {
    const me = person(c);
    const s = await ownSubscription(me.id);
    if (!s) throw new HttpError(404, 'not_found', 'No active subscription');
    await d.gateways[s.gateway]!.cancelSubscription({ subscriptionRef: s.gateway_ref, atPeriodEnd: true });
    await d.db.query('update billing.subscriptions set cancel_at_period_end = true where gateway = $1 and gateway_ref = $2', [s.gateway, s.gateway_ref]);
    return c.body(null, 204);
  });

  return app;
}
