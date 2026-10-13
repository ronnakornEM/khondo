import { Hono } from 'hono';
import { z } from 'zod';
import { one, query, buildUpdate } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { requireAuth, requireFeature, type AuthEnv } from '../auth.js';
import { iso } from '../mappers.js';
import { CONTACT_KINDS, CONTACT_STAGES } from '../../shared/types.js';

export const contacts = new Hono<AuthEnv>();
// Scoped to this router's own paths: mounted at '/', a bare '*' would leak onto every other route.
for (const path of ['/contacts', '/contacts/*']) contacts.use(path, requireAuth, requireFeature('contacts'));

const out = (r: any) => ({ ...r, lastContactedAt: iso(r.lastContactedAt), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) });

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().max(40),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]),
  lineId: z.string().trim().max(60),
  kind: z.enum(CONTACT_KINDS),
  stage: z.enum(CONTACT_STAGES),
  source: z.string().trim().max(60),
  propertyId: z.string().uuid().nullable(),
  budget: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(1e12).nullable()),
  tags: z.array(z.string().trim().min(1).max(30)).max(20),
  notes: z.string().trim().max(8000),
  lastContactedAt: z.string().datetime().nullable(),
});

const SELECT = `SELECT c.*, p.title AS property_title FROM contacts c LEFT JOIN properties p ON p.id = c.property_id`;

async function ownsProperty(agentId: string, propertyId?: string | null) {
  if (propertyId && !(await one('SELECT 1 FROM properties WHERE id=$1 AND agent_id=$2', [propertyId, agentId]))) {
    throw new HttpError(400, 'Unknown property', 'validation');
  }
}

contacts.get('/contacts', async (c) => {
  const params: unknown[] = [c.get('agent').id];
  let where = 'c.agent_id = $1';
  const stage = c.req.query('stage');
  const q = c.req.query('q')?.trim();
  if (stage && (CONTACT_STAGES as readonly string[]).includes(stage)) {
    params.push(stage);
    where += ` AND c.stage = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    where += ` AND (c.name ILIKE ${p} OR c.phone ILIKE ${p} OR c.email ILIKE ${p} OR c.notes ILIKE ${p} OR EXISTS (SELECT 1 FROM unnest(c.tags) t WHERE t ILIKE ${p}))`;
  }
  const rows = await query(`${SELECT} WHERE ${where} ORDER BY c.updated_at DESC LIMIT 1000`, params);
  return c.json(rows.map(out));
});

contacts.get('/contacts/:id', async (c) => {
  const row = await one(`${SELECT} WHERE c.id=$1 AND c.agent_id=$2`, [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!row) throw new HttpError(404, 'Contact not found');
  return c.json(out(row));
});

contacts.post('/contacts', async (c) => {
  const agent = c.get('agent');
  const data = parse(schema.partial().required({ name: true }), await body(c));
  await ownsProperty(agent.id, data.propertyId);
  const row = await one(
    `INSERT INTO contacts (agent_id, name, phone, email, line_id, kind, stage, source, property_id, budget, tags, notes, last_contacted_at)
     VALUES ($1,$2,coalesce($3,''),coalesce($4,''),coalesce($5,''),coalesce($6,'buyer'),coalesce($7,'new'),coalesce($8,'manual'),$9,$10,coalesce($11::text[],'{}'),coalesce($12,''),$13)
     RETURNING id`,
    [agent.id, data.name, data.phone, data.email, data.lineId, data.kind, data.stage, data.source, data.propertyId ?? null, data.budget ?? null, data.tags, data.notes, data.lastContactedAt ?? null],
  );
  return c.json(out(await one(`${SELECT} WHERE c.id=$1`, [row.id])), 201);
});

contacts.patch('/contacts/:id', async (c) => {
  const agent = c.get('agent');
  const id = parse(uuid, c.req.param('id'));
  const data = parse(schema.partial(), await body(c));
  await ownsProperty(agent.id, data.propertyId);
  const { sets, values } = buildUpdate(data);
  if (!sets.length) throw new HttpError(400, 'Nothing to update', 'validation');
  const row = await one(`UPDATE contacts SET ${sets.join(', ')}, updated_at = now() WHERE id=$${values.length + 1} AND agent_id=$${values.length + 2} RETURNING id`, [...values, id, agent.id]);
  if (!row) throw new HttpError(404, 'Contact not found');
  return c.json(out(await one(`${SELECT} WHERE c.id=$1`, [id])));
});

contacts.delete('/contacts/:id', async (c) => {
  const rows = await query('DELETE FROM contacts WHERE id=$1 AND agent_id=$2 RETURNING id', [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!rows.length) throw new HttpError(404, 'Contact not found');
  return c.json({ ok: true });
});
