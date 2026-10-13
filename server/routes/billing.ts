import { Hono } from 'hono';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError, body, parse } from '../http.js';
import { requireAuth, type AuthEnv } from '../auth.js';
import { toAgent } from '../mappers.js';
import { resolvePriceId, stripeEnabled, stripeMode, stripeRequest } from '../stripe.js';

// Subscriptions run on Stripe Checkout + Customer Portal (supports cards and PromptPay in Thailand).
// Plain fetch keeps the serverless bundle small — no SDK needed.
export const billing = new Hono<AuthEnv>();

// Free plan switching is for local testing only — it can never be on in a Vercel production deployment.
const devUpgrade = () => process.env.ALLOW_DEV_UPGRADE === 'true' && process.env.VERCEL_ENV !== 'production';

const stripe = <T = any>(path: string, params: Record<string, string> = {}) => stripeRequest<T>('POST', path, params);

const appUrl = (c: { req: { url: string } }) => process.env.APP_URL?.replace(/\/$/, '') || new URL(c.req.url).origin;

billing.get('/billing/config', requireAuth, (c) =>
  c.json({ stripe: stripeEnabled(), mode: stripeEnabled() ? stripeMode() : null, devUpgrade: devUpgrade() }),
);

billing.post('/billing/checkout', requireAuth, async (c) => {
  const agent = c.get('agent');
  if (agent.plan === 'premium') throw new HttpError(409, 'You are already on Premium', 'already_premium');
  if (stripeEnabled()) {
    let customer = agent.stripeCustomerId;
    if (!customer) {
      const user = await one<{ email: string }>('SELECT email FROM users WHERE id=$1', [agent.userId]);
      customer = (await stripe('customers', { email: user!.email, name: agent.displayName, 'metadata[agent_id]': agent.id })).id as string;
      await query('UPDATE agents SET stripe_customer_id=$1 WHERE id=$2', [customer, agent.id]);
    }
    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: agent.id,
      'line_items[0][price]': await resolvePriceId(),
      'line_items[0][quantity]': '1',
      success_url: `${appUrl(c)}/app/billing?status=success`,
      cancel_url: `${appUrl(c)}/app/billing?status=cancelled`,
      allow_promotion_codes: 'true',
    });
    return c.json({ url: session.url as string });
  }
  if (devUpgrade()) {
    const row = await one('UPDATE agents SET plan=\'premium\', plan_renews_at = now() + interval \'30 days\' WHERE id=$1 RETURNING *', [agent.id]);
    return c.json({ url: null, agent: toAgent({ ...row, plan: 'premium' }) });
  }
  throw new HttpError(501, 'Payments are not configured yet', 'billing_disabled');
});

billing.post('/billing/portal', requireAuth, async (c) => {
  const agent = c.get('agent');
  if (!stripeEnabled() || !agent.stripeCustomerId) throw new HttpError(400, 'No billing account to manage', 'no_customer');
  const session = await stripe('billing_portal/sessions', { customer: agent.stripeCustomerId, return_url: `${appUrl(c)}/app/billing` });
  return c.json({ url: session.url as string });
});

// Pulls the subscription state straight from Stripe. The webhook is the normal path, but this makes the sandbox
// work locally (no `stripe listen` needed) and heals a missed webhook: the app calls it when the customer returns
// from Checkout.
billing.post('/billing/sync', requireAuth, async (c) => {
  const agent = c.get('agent');
  if (!stripeEnabled()) throw new HttpError(501, 'Payments are not configured yet', 'billing_disabled');
  const stored = await one<{ plan: 'free' | 'premium'; stripeCustomerId: string | null }>('SELECT plan, stripe_customer_id FROM agents WHERE id = $1', [agent.id]);
  if (!stored?.stripeCustomerId) return c.json({ plan: stored?.plan ?? agent.plan, changed: false });
  const subs = await stripeRequest<{ data: any[] }>('GET', 'subscriptions', { customer: stored.stripeCustomerId, status: 'all', limit: '10' });
  const active = subs.data.find((s) => ['active', 'trialing', 'past_due'].includes(s.status));
  let plan: 'free' | 'premium' = stored.plan;
  if (active) {
    const end = active.current_period_end ?? active.items?.data?.[0]?.current_period_end ?? null;
    await query(`UPDATE agents SET plan='premium', stripe_subscription_id=$1, plan_renews_at = CASE WHEN $2::bigint IS NULL THEN NULL ELSE to_timestamp($2::bigint) END WHERE id=$3`, [active.id, end, agent.id]);
    plan = 'premium';
  } else if (subs.data.length) {
    await query(`UPDATE agents SET plan='free', plan_renews_at=NULL, stripe_subscription_id=NULL WHERE id=$1`, [agent.id]);
    plan = 'free';
  }
  return c.json({ plan, changed: plan !== stored.plan });
});

// Local testing only: flip plans without Stripe.
billing.post('/billing/dev-plan', requireAuth, async (c) => {
  if (!devUpgrade()) throw new HttpError(403, 'Disabled', 'forbidden');
  const { plan } = parse(z.object({ plan: z.enum(['free', 'premium']) }), await body(c));
  const row = await one('UPDATE agents SET plan=$1, plan_renews_at = CASE WHEN $1=\'premium\' THEN now() + interval \'30 days\' END WHERE id=$2 RETURNING *', [plan, c.get('agent').id]);
  return c.json({ agent: toAgent(row) });
});

function verifySignature(raw: string, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = parts.t;
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const sig = p.slice(3);
      return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    });
}

billing.post('/billing/webhook', async (c) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(501, 'Webhook not configured', 'billing_disabled');
  const raw = await c.req.text();
  if (!verifySignature(raw, c.req.header('stripe-signature'), secret)) throw new HttpError(400, 'Bad signature', 'bad_signature');
  const event = JSON.parse(raw);
  const obj = event.data?.object ?? {};

  if (event.type === 'checkout.session.completed' && obj.client_reference_id) {
    await query(
      `UPDATE agents SET plan='premium', stripe_customer_id=$1, stripe_subscription_id=$2 WHERE id=$3`,
      [obj.customer, obj.subscription, obj.client_reference_id],
    );
  } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const active = ['active', 'trialing', 'past_due'].includes(obj.status);
    const end = obj.current_period_end ?? obj.items?.data?.[0]?.current_period_end;
    await query(
      `UPDATE agents SET plan=$1, stripe_subscription_id=$2, plan_renews_at = CASE WHEN $3::bigint IS NULL THEN NULL ELSE to_timestamp($3::bigint) END
       WHERE stripe_customer_id=$4`,
      [active ? 'premium' : 'free', obj.id, end ?? null, obj.customer],
    );
  } else if (event.type === 'customer.subscription.deleted') {
    await query(`UPDATE agents SET plan='free', plan_renews_at=NULL, stripe_subscription_id=NULL WHERE stripe_customer_id=$1`, [obj.customer]);
  }
  return c.json({ received: true });
});
