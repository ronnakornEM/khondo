import { Hono } from 'hono';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { requireSuperuser, type AuthEnv } from '../auth.js';
import { iso } from '../mappers.js';

// Superuser tools for testing Premium: see every agent and switch their plan by hand.
// Superusers are created with `npm run admin:grant -- you@example.com` — never through the public sign-up form.
export const admin = new Hono<AuthEnv>();
for (const path of ['/admin', '/admin/*']) admin.use(path, requireSuperuser);

admin.get('/admin/overview', async (c) => {
  const [totals] = await query(
    `SELECT (SELECT count(*) FROM users WHERE role='agent')::int AS agents,
            (SELECT count(*) FROM users WHERE role='customer')::int AS customers,
            (SELECT count(*) FROM agents WHERE plan='premium')::int AS premium,
            (SELECT count(*) FROM properties)::int AS properties,
            (SELECT count(*) FROM inquiries)::int AS inquiries`,
  );
  const agents = await query(
    `SELECT a.id, a.slug, a.display_name, a.plan, a.plan_renews_at, a.stripe_customer_id, a.created_at,
            u.email, u.is_superuser,
            (SELECT count(*) FROM properties p WHERE p.agent_id = a.id)::int AS properties
     FROM agents a JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 300`,
  );
  return c.json({ totals, agents: agents.map((a) => ({ ...a, planRenewsAt: iso(a.planRenewsAt), createdAt: iso(a.createdAt), hasStripe: !!a.stripeCustomerId, stripeCustomerId: undefined })) });
});

admin.post('/admin/agents/:id/plan', async (c) => {
  const { plan } = parse(z.object({ plan: z.enum(['free', 'premium']) }), await body(c));
  const row = await one(
    `UPDATE agents SET plan = $1, plan_renews_at = CASE WHEN $1 = 'premium' THEN now() + interval '30 days' END WHERE id = $2 RETURNING id, plan`,
    [plan, parse(uuid, c.req.param('id'))],
  );
  if (!row) throw new HttpError(404, 'Agent not found');
  return c.json(row);
});
