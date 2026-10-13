import { Hono } from 'hono';
import { z } from 'zod';
import { one, query, buildUpdate } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { requireAuth, type AuthEnv } from '../auth.js';
import { propertyOut } from '../mappers.js';
import { PLANS } from '../../shared/plans.js';
import { LISTING_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES } from '../../shared/types.js';

export const properties = new Hono<AuthEnv>();
// Scoped to this router's own paths: mounted at '/', a bare '*' would leak onto every other route.
for (const path of ['/properties', '/properties/*']) properties.use(path, requireAuth);

const num = (max = 1e12) =>
  z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(max).nullable());
const int = (max = 1000) =>
  z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().min(-5).max(max).nullable());

const propertySchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160),
  description: z.string().trim().max(8000),
  type: z.enum(PROPERTY_TYPES),
  listingType: z.enum(LISTING_TYPES),
  status: z.enum(PROPERTY_STATUSES),
  price: num(),
  rentPrice: num(),
  bedrooms: int(50),
  bathrooms: int(50),
  areaSqm: num(1e7),
  landSqw: num(1e7),
  floor: int(200),
  address: z.string().trim().max(300),
  district: z.string().trim().max(100),
  province: z.string().trim().max(100),
  latitude: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(-90).max(90).nullable()),
  longitude: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(-180).max(180).nullable()),
  amenities: z.array(z.string().trim().min(1).max(40)).max(40),
  photos: z.array(z.string().trim().url().max(1000).refine((u) => /^https?:/i.test(u))).max(30),
  featured: z.boolean(),
  published: z.boolean(),
});

const createSchema = propertySchema.partial().required({ title: true });
const updateSchema = propertySchema.partial();

properties.get('/properties', async (c) => {
  const agent = c.get('agent');
  const q = c.req.query('q')?.trim();
  const status = c.req.query('status');
  const params: unknown[] = [agent.id];
  let where = 'agent_id = $1';
  if (status && (PROPERTY_STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (title ILIKE $${params.length} OR district ILIKE $${params.length} OR address ILIKE $${params.length})`;
  }
  const rows = await query(`SELECT * FROM properties WHERE ${where} ORDER BY created_at DESC LIMIT 500`, params);
  return c.json(rows.map(propertyOut));
});

properties.get('/properties/:id', async (c) => {
  const row = await one('SELECT * FROM properties WHERE id=$1 AND agent_id=$2', [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!row) throw new HttpError(404, 'Property not found');
  return c.json(propertyOut(row));
});

properties.post('/properties', async (c) => {
  const agent = c.get('agent');
  const limits = PLANS[agent.plan];
  const data = parse(createSchema, await body(c));
  const [{ count }] = await query<{ count: number }>('SELECT count(*)::int AS count FROM properties WHERE agent_id=$1', [agent.id]);
  if (count >= limits.maxProperties) {
    throw new HttpError(402, `The ${limits.label} plan includes up to ${limits.maxProperties} properties. Upgrade to add more.`, 'property_limit');
  }
  if (data.photos && data.photos.length > limits.maxPhotosPerProperty) {
    throw new HttpError(402, `Up to ${limits.maxPhotosPerProperty} photos per property on the ${limits.label} plan.`, 'photo_limit');
  }
  const d = { province: 'Khon Kaen', ...data };
  const cols = Object.keys(d).filter((k) => (d as Record<string, unknown>)[k] !== undefined);
  const jsonCols = ['photos'];
  const { values } = buildUpdate(d, jsonCols, 2);
  const snake = cols.map((k) => k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()));
  const placeholders = cols.map((k, i) => `$${i + 2}${jsonCols.includes(k) ? '::jsonb' : ''}`);
  const row = await one(
    `INSERT INTO properties (agent_id, ${snake.join(', ')}) VALUES ($1, ${placeholders.join(', ')}) RETURNING *`,
    [agent.id, ...values],
  );
  return c.json(propertyOut(row), 201);
});

properties.patch('/properties/:id', async (c) => {
  const agent = c.get('agent');
  const id = parse(uuid, c.req.param('id'));
  const data = parse(updateSchema, await body(c));
  const limits = PLANS[agent.plan];
  if (data.photos && data.photos.length > limits.maxPhotosPerProperty) {
    throw new HttpError(402, `Up to ${limits.maxPhotosPerProperty} photos per property on the ${limits.label} plan.`, 'photo_limit');
  }
  const { sets, values } = buildUpdate(data, ['photos']);
  if (!sets.length) throw new HttpError(400, 'Nothing to update', 'validation');
  const row = await one(
    `UPDATE properties SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length + 1} AND agent_id = $${values.length + 2} RETURNING *`,
    [...values, id, agent.id],
  );
  if (!row) throw new HttpError(404, 'Property not found');
  return c.json(propertyOut(row));
});

properties.delete('/properties/:id', async (c) => {
  const rows = await query('DELETE FROM properties WHERE id=$1 AND agent_id=$2 RETURNING id', [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!rows.length) throw new HttpError(404, 'Property not found');
  return c.json({ ok: true });
});
