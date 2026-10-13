import { Hono } from 'hono';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { requireUser, type AuthEnv } from '../auth.js';
import { iso } from '../mappers.js';
import { CAPS, RANKED_CTE, withAgent } from './public.js';

// Saved properties and "my inquiries" — available to any signed-in account (customers mainly).
export const customer = new Hono<AuthEnv>();
for (const path of ['/favorites', '/favorites/*', '/my/*']) customer.use(path, requireUser);

customer.get('/favorites/ids', async (c) => {
  const rows = await query<{ propertyId: string }>('SELECT property_id FROM favorites WHERE user_id = $1', [c.get('user').id]);
  return c.json({ ids: rows.map((r) => r.propertyId) });
});

// Full cards for the "Saved" page; listings that are no longer public simply drop out.
customer.get('/favorites', async (c) => {
  const rows = await query(
    `WITH ${RANKED_CTE}
     SELECT r.*, 0 AS total FROM ranked r JOIN favorites f ON f.property_id = r.id
     WHERE f.user_id = $3 AND r.rn <= r.cap
     ORDER BY f.created_at DESC`,
    [...CAPS, c.get('user').id],
  );
  return c.json({ items: withAgent(rows) });
});

customer.put('/favorites/:propertyId', async (c) => {
  const id = parse(uuid, c.req.param('propertyId'));
  const rows = await query('INSERT INTO favorites (user_id, property_id) SELECT $1, id FROM properties WHERE id = $2 AND published ON CONFLICT DO NOTHING RETURNING property_id', [c.get('user').id, id]);
  if (!rows.length) {
    const exists = await query('SELECT 1 FROM favorites WHERE user_id=$1 AND property_id=$2', [c.get('user').id, id]);
    if (!exists.length) throw new HttpError(404, 'Property not found', 'not_found');
  }
  return c.json({ ok: true });
});

customer.delete('/favorites/:propertyId', async (c) => {
  await query('DELETE FROM favorites WHERE user_id=$1 AND property_id=$2', [c.get('user').id, parse(uuid, c.req.param('propertyId'))]);
  return c.json({ ok: true });
});

// Guest → account: save the favourites a visitor collected before signing in.
customer.post('/favorites/merge', async (c) => {
  const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).max(200) }), await body(c));
  if (ids.length) {
    await query('INSERT INTO favorites (user_id, property_id) SELECT $1, id FROM properties WHERE id = ANY($2::uuid[]) AND published ON CONFLICT DO NOTHING', [c.get('user').id, ids]);
  }
  return c.json({ ok: true });
});

customer.get('/my/inquiries', async (c) => {
  const rows = await query(
    `SELECT i.id, i.message, i.created_at, i.property_id, p.title AS property_title, p.photos AS property_photos,
            a.slug AS agent_slug, a.display_name AS agent_name, a.phone AS agent_phone, a.line_id AS agent_line_id, a.contact_email AS agent_email
     FROM inquiries i
     JOIN agents a ON a.id = i.agent_id
     LEFT JOIN properties p ON p.id = i.property_id
     WHERE i.user_id = $1 ORDER BY i.created_at DESC LIMIT 100`,
    [c.get('user').id],
  );
  return c.json(rows.map((r) => ({ ...r, createdAt: iso(r.createdAt), propertyPhoto: r.propertyPhotos?.[0] ?? null, propertyPhotos: undefined })));
});
