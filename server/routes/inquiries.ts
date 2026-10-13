import { Hono } from 'hono';
import { z } from 'zod';
import { one, query } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { requireAuth, requireFeature, type AuthEnv } from '../auth.js';
import { iso } from '../mappers.js';

export const inquiries = new Hono<AuthEnv>();
// Scoped to this router's own paths: mounted at '/', a bare '*' would leak onto every other route.
for (const path of ['/inquiries', '/inquiries/*']) inquiries.use(path, requireAuth);

const out = (r: any) => ({ ...r, createdAt: iso(r.createdAt) });

inquiries.get('/inquiries', async (c) => {
  const rows = await query(
    `SELECT i.*, p.title AS property_title FROM inquiries i LEFT JOIN properties p ON p.id = i.property_id
     WHERE i.agent_id = $1 ORDER BY i.created_at DESC LIMIT 300`,
    [c.get('agent').id],
  );
  return c.json(rows.map(out));
});

inquiries.patch('/inquiries/:id', async (c) => {
  const { handled } = parse(z.object({ handled: z.boolean() }), await body(c));
  const row = await one('UPDATE inquiries SET handled=$1 WHERE id=$2 AND agent_id=$3 RETURNING *', [handled, parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!row) throw new HttpError(404, 'Inquiry not found');
  return c.json(out(row));
});

inquiries.delete('/inquiries/:id', async (c) => {
  const rows = await query('DELETE FROM inquiries WHERE id=$1 AND agent_id=$2 RETURNING id', [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!rows.length) throw new HttpError(404, 'Inquiry not found');
  return c.json({ ok: true });
});

// Premium: promote an inquiry into the contact manager.
inquiries.post('/inquiries/:id/convert', requireFeature('contacts'), async (c) => {
  const agent = c.get('agent');
  const inq = await one<any>('SELECT * FROM inquiries WHERE id=$1 AND agent_id=$2', [parse(uuid, c.req.param('id')), agent.id]);
  if (!inq) throw new HttpError(404, 'Inquiry not found');
  const contact = await one(
    `INSERT INTO contacts (agent_id, name, phone, email, source, property_id, notes)
     VALUES ($1,$2,$3,$4,'website',$5,$6) RETURNING id`,
    [agent.id, inq.name, inq.phone, inq.email, inq.propertyId, inq.message],
  );
  await query('UPDATE inquiries SET handled = true WHERE id = $1', [inq.id]);
  return c.json({ contactId: contact.id }, 201);
});
