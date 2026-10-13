import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import type { AgentRow } from '../auth.js';
import { landingOf, propertyOut, toPublicAgent } from '../mappers.js';
import { PLANS } from '../../shared/plans.js';

export const pub = new Hono();

// Public pages are cacheable at the edge for a short time; the app stays snappy and Neon stays asleep.
// Set per handler (never as router middleware): this router is mounted at '/', so a '*' middleware would
// also stamp the cache header onto authenticated routes mounted after it.
const edgeCache = (c: Context) => c.header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');

async function agentBySlug(slug: string) {
  const agent = await one<AgentRow>('SELECT * FROM agents WHERE lower(slug) = lower($1)', [slug]);
  if (!agent) throw new HttpError(404, 'This page does not exist', 'not_found');
  return agent;
}

/** Published listings visible on the public page, honouring the plan's listing limit. */
const VISIBLE = `
  WITH visible AS (
    SELECT * FROM properties WHERE agent_id = $1 AND published
    ORDER BY featured DESC, created_at DESC LIMIT $2
  )`;

pub.get('/public/agents/:slug', async (c) => {
  const agent = await agentBySlug(c.req.param('slug'));
  const landing = landingOf(agent);
  const rows = await query(
    `${VISIBLE}
     SELECT * FROM visible
     ORDER BY (status IN ('available','reserved')) DESC, featured DESC, created_at DESC`,
    [agent.id, PLANS[agent.plan].maxProperties],
  );
  const list = rows.filter((p) => landing.showSold || p.status === 'available' || p.status === 'reserved');
  edgeCache(c);
  return c.json({ agent: toPublicAgent(agent), properties: list.map(propertyOut) });
});

pub.get('/public/agents/:slug/properties/:id', async (c) => {
  const agent = await agentBySlug(c.req.param('slug'));
  const id = parse(uuid, c.req.param('id'));
  const row = await one(`${VISIBLE} SELECT * FROM visible WHERE id = $3`, [agent.id, PLANS[agent.plan].maxProperties, id]);
  if (!row) throw new HttpError(404, 'Property not found', 'not_found');
  edgeCache(c);
  return c.json({ agent: toPublicAgent(agent), property: propertyOut(row) });
});

const inquirySchema = z
  .object({
    name: z.string().trim().min(1, 'Please tell us your name').max(100),
    phone: z.string().trim().max(40).default(''),
    email: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(200)]).default(''),
    message: z.string().trim().max(2000).default(''),
    propertyId: z.string().uuid().nullable().optional(),
    website: z.string().optional(), // honeypot – real users never fill this in
  })
  .refine((v) => v.phone || v.email, { message: 'Please leave a phone number or email so the agent can reach you', path: ['phone'] });

pub.post('/public/agents/:slug/inquiries', async (c) => {
  const agent = await agentBySlug(c.req.param('slug'));
  const data = parse(inquirySchema, await body(c));
  if (data.website) return c.json({ ok: true }, 201); // bot: pretend it worked
  const [recent] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM inquiries
     WHERE agent_id = $1 AND created_at > now() - interval '1 hour'
       AND ((phone <> '' AND phone = $2) OR (email <> '' AND email = $3))`,
    [agent.id, data.phone, data.email],
  );
  const [burst] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM inquiries WHERE agent_id = $1 AND created_at > now() - interval '1 minute'`,
    [agent.id],
  );
  if (recent.n >= 3 || burst.n >= 10) throw new HttpError(429, 'Too many messages — please try again later', 'rate_limited');

  let propertyId = data.propertyId ?? null;
  if (propertyId && !(await one('SELECT 1 FROM properties WHERE id=$1 AND agent_id=$2', [propertyId, agent.id]))) propertyId = null;
  await query(
    'INSERT INTO inquiries (agent_id, property_id, name, phone, email, message) VALUES ($1,$2,$3,$4,$5,$6)',
    [agent.id, propertyId, data.name, data.phone, data.email, data.message],
  );
  return c.json({ ok: true }, 201);
});
