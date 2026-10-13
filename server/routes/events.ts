import { Hono } from 'hono';
import { z } from 'zod';
import { one, query, buildUpdate } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { requireAuth, type AuthEnv } from '../auth.js';
import { eventOut } from '../mappers.js';
import { PLANS } from '../../shared/plans.js';
import { EVENT_KINDS, RECURRENCES } from '../../shared/types.js';

export const events = new Hono<AuthEnv>();
// Scoped to this router's own paths: mounted at '/', a bare '*' would leak onto every other route.
for (const path of ['/events', '/events/*']) events.use(path, requireAuth);

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(160),
  description: z.string().trim().max(4000),
  kind: z.enum(EVENT_KINDS),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  allDay: z.boolean(),
  location: z.string().trim().max(200),
  contactId: z.string().uuid().nullable(),
  propertyId: z.string().uuid().nullable(),
  recurrence: z.enum(RECURRENCES),
  recurrenceUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  reminderMinutes: z.number().int().min(0).max(60 * 24 * 14).nullable(),
});

const SELECT = `SELECT e.*, c.name AS contact_name, p.title AS property_title
  FROM events e LEFT JOIN contacts c ON c.id = e.contact_id LEFT JOIN properties p ON p.id = e.property_id`;

async function guard(agent: { id: string; plan: 'free' | 'premium' }, d: Partial<z.infer<typeof schema>>) {
  if (!PLANS[agent.plan].advancedCalendar) {
    if ((d.recurrence && d.recurrence !== 'none') || d.contactId || d.propertyId || d.reminderMinutes != null) {
      throw new HttpError(402, 'Recurring events, reminders and links to contacts/properties are part of Khondo Premium', 'premium_required');
    }
  }
  if (d.contactId && !(await one('SELECT 1 FROM contacts WHERE id=$1 AND agent_id=$2', [d.contactId, agent.id]))) throw new HttpError(400, 'Unknown contact', 'validation');
  if (d.propertyId && !(await one('SELECT 1 FROM properties WHERE id=$1 AND agent_id=$2', [d.propertyId, agent.id]))) throw new HttpError(400, 'Unknown property', 'validation');
  if (d.startAt && d.endAt && new Date(d.endAt) < new Date(d.startAt)) throw new HttpError(400, 'End must be after start', 'validation');
}

// Returns events that touch [from, to]. Recurring series are returned once; clients expand them (shared/recurrence.ts).
events.get('/events', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  if (!from || !to || isNaN(+new Date(from)) || isNaN(+new Date(to))) throw new HttpError(400, 'from and to (ISO dates) are required', 'validation');
  const rows = await query(
    `${SELECT} WHERE e.agent_id = $1 AND e.start_at <= $3 AND (
        (e.recurrence = 'none' AND e.end_at >= $2)
        OR (e.recurrence <> 'none' AND (e.recurrence_until IS NULL OR e.recurrence_until >= $2::timestamptz::date)))
     ORDER BY e.start_at LIMIT 2000`,
    [c.get('agent').id, from, to],
  );
  return c.json(rows.map(eventOut));
});

events.post('/events', async (c) => {
  const agent = c.get('agent');
  const data = parse(schema.partial().required({ title: true, startAt: true, endAt: true }), await body(c));
  await guard(agent, data);
  const row = await one(
    `INSERT INTO events (agent_id, title, description, kind, start_at, end_at, all_day, location, contact_id, property_id, recurrence, recurrence_until, reminder_minutes)
     VALUES ($1,$2,coalesce($3,''),coalesce($4,'meeting'),$5,$6,coalesce($7,false),coalesce($8,''),$9,$10,coalesce($11,'none'),$12,$13) RETURNING id`,
    [agent.id, data.title, data.description, data.kind, data.startAt, data.endAt, data.allDay, data.location, data.contactId ?? null, data.propertyId ?? null, data.recurrence, data.recurrenceUntil ?? null, data.reminderMinutes ?? null],
  );
  return c.json(eventOut(await one(`${SELECT} WHERE e.id=$1`, [row.id])), 201);
});

events.patch('/events/:id', async (c) => {
  const agent = c.get('agent');
  const id = parse(uuid, c.req.param('id'));
  const data = parse(schema.partial(), await body(c));
  await guard(agent, data);
  const { sets, values } = buildUpdate(data);
  if (!sets.length) throw new HttpError(400, 'Nothing to update', 'validation');
  const row = await one(`UPDATE events SET ${sets.join(', ')}, updated_at = now() WHERE id=$${values.length + 1} AND agent_id=$${values.length + 2} RETURNING id`, [...values, id, agent.id]);
  if (!row) throw new HttpError(404, 'Event not found');
  return c.json(eventOut(await one(`${SELECT} WHERE e.id=$1`, [id])));
});

events.delete('/events/:id', async (c) => {
  const rows = await query('DELETE FROM events WHERE id=$1 AND agent_id=$2 RETURNING id', [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!rows.length) throw new HttpError(404, 'Event not found');
  return c.json({ ok: true });
});
