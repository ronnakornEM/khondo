import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { AGENT_SELECT, optionalUser, withEffectivePlan, type AgentRow, type AuthEnv } from '../auth.js';
import { landingOf, propertyOut, toPublicAgent } from '../mappers.js';
import { PLANS } from '../../shared/plans.js';
import { LISTING_TYPES, PROPERTY_TYPES } from '../../shared/types.js';

export const pub = new Hono<AuthEnv>();

// Public pages are cacheable at the edge for a short time; the app stays snappy and Neon stays asleep.
// Set per handler (never as router middleware): this router is mounted at '/', so a '*' middleware would
// also stamp the cache header onto authenticated routes mounted after it.
const edgeCache = (c: Context) => c.header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');

async function agentBySlug(slug: string) {
  const row = await one<AgentRow>(`${AGENT_SELECT} WHERE lower(a.slug) = lower($1)`, [slug]);
  if (!row) throw new HttpError(404, 'This page does not exist', 'not_found');
  return withEffectivePlan(row);
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
  const limit = PLANS[agent.plan].maxProperties;
  const row = await one(`${VISIBLE} SELECT * FROM visible WHERE id = $3`, [agent.id, limit, id]);
  if (!row) throw new HttpError(404, 'Property not found', 'not_found');
  // "More from this agent": other visible listings, live ones first
  const others = await query(
    `${VISIBLE}
     SELECT * FROM visible WHERE id <> $3 AND status IN ('available','reserved')
     ORDER BY featured DESC, created_at DESC`,
    [agent.id, limit, id],
  );
  edgeCache(c);
  return c.json({ agent: toPublicAgent(agent), property: propertyOut(row), others: others.slice(0, 6).map(propertyOut), othersTotal: others.length });
});

// ---------------------------------------------------------------------------------------------
// Browse: every live listing from every agent (guests welcome). Honours each agent's plan limit exactly like
// the agent's own page does, so a downgraded agent can't leak extra listings through here.
// ---------------------------------------------------------------------------------------------
const PAGE_SIZE = 24;

/** All published listings with their rank inside the agent's plan allowance. $1 = premium cap, $2 = free cap. */
export const RANKED_CTE = `
  ranked AS (
    SELECT p.*, a.slug AS agent_slug, a.display_name AS agent_name, a.avatar_url AS agent_avatar, a.headline AS agent_headline,
           row_number() OVER (PARTITION BY p.agent_id ORDER BY p.featured DESC, p.created_at DESC) AS rn,
           CASE WHEN a.plan = 'premium' OR u.is_superuser THEN $1::int ELSE $2::int END AS cap
    FROM properties p JOIN agents a ON a.id = p.agent_id JOIN users u ON u.id = a.user_id
    WHERE p.published
  )`;
export const CAPS = [PLANS.premium.maxProperties, PLANS.free.maxProperties];

export function withAgent(rows: any[]) {
  return rows.map(({ agentSlug, agentName, agentAvatar, agentHeadline, rn, cap, total, ...p }) => ({
    ...propertyOut(p),
    agent: { slug: agentSlug, displayName: agentName, avatarUrl: agentAvatar, headline: agentHeadline },
  }));
}
const browseQuery = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(PROPERTY_TYPES).optional(),
  listing: z.enum(['sale', 'rent']).optional(),
  min: z.coerce.number().min(0).max(1e12).optional(),
  max: z.coerce.number().min(0).max(1e12).optional(),
  beds: z.coerce.number().int().min(0).max(20).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  agent: z.string().trim().max(60).optional(),
  ids: z.string().max(2000).optional(), // comma-separated property ids (a guest's saved list)
});

pub.get('/public/properties', async (c) => {
  const f = parse(browseQuery, Object.fromEntries(Object.entries(c.req.query()).filter(([, v]) => v !== '')));
  const params: unknown[] = [...CAPS];
  const where: string[] = [`status IN ('available','reserved')`, 'rn <= cap'];
  const add = (v: unknown) => (params.push(v), `$${params.length}`);
  if (f.q) {
    const p = add(`%${f.q}%`);
    where.push(`(title ILIKE ${p} OR district ILIKE ${p} OR address ILIKE ${p} OR province ILIKE ${p} OR agent_name ILIKE ${p})`);
  }
  if (f.type) where.push(`type = ${add(f.type)}`);
  if (f.listing) where.push(f.listing === 'sale' ? `listing_type IN ('sale','both')` : `listing_type IN ('rent','both')`);
  const priceCol = f.listing === 'rent' ? 'rent_price' : 'price';
  if (f.listing && f.min != null) where.push(`${priceCol} >= ${add(f.min)}`);
  if (f.listing && f.max != null) where.push(`${priceCol} <= ${add(f.max)}`);
  if (f.beds != null) where.push(`bedrooms >= ${add(f.beds)}`);
  if (f.ids) {
    const list = f.ids.split(',').map((x) => x.trim()).filter((x) => uuid.safeParse(x).success).slice(0, 50);
    where.push(`id = ANY(${add(list)}::uuid[])`);
  }
  if (f.agent) where.push(`lower(agent_slug) = lower(${add(f.agent)})`);
  const sortCol = f.listing === 'rent' ? 'rent_price' : f.listing === 'sale' ? 'price' : 'coalesce(price, rent_price)';
  const order = f.sort === 'price_asc' ? `${sortCol} ASC NULLS LAST, created_at DESC` : f.sort === 'price_desc' ? `${sortCol} DESC NULLS LAST, created_at DESC` : 'created_at DESC';
  const rows = await query(
    `WITH ${RANKED_CTE}
     SELECT *, count(*) OVER ()::int AS total FROM ranked
     WHERE ${where.join(' AND ')}
     ORDER BY ${order}
     LIMIT ${PAGE_SIZE} OFFSET ${(f.page - 1) * PAGE_SIZE}`,
    params,
  );
  const items = withAgent(rows);
  edgeCache(c);
  return c.json({ items, total: rows[0]?.total ?? 0, page: f.page, pageSize: PAGE_SIZE });
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

pub.post('/public/agents/:slug/inquiries', optionalUser, async (c) => {
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
    'INSERT INTO inquiries (agent_id, property_id, name, phone, email, message, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [agent.id, propertyId, data.name, data.phone, data.email, data.message, c.get('user')?.id ?? null],
  );
  return c.json({ ok: true }, 201);
});
