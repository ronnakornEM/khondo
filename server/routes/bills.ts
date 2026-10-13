import { Hono } from 'hono';
import { z } from 'zod';
import { one, query, buildUpdate } from '../db.js';
import { HttpError, body, parse, uuid } from '../http.js';
import { requireAuth, requireFeature, type AuthEnv } from '../auth.js';
import { iso } from '../mappers.js';
import { BILL_KINDS, BILL_STATUSES } from '../../shared/types.js';

export const bills = new Hono<AuthEnv>();
// Scoped to this router's own paths: mounted at '/', a bare '*' would leak onto every other route.
for (const path of ['/bills', '/bills/*']) bills.use(path, requireAuth, requireFeature('bills'));

export const todayBangkok = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

const out = (r: any) => ({
  ...r,
  paidAt: iso(r.paidAt),
  createdAt: iso(r.createdAt),
  updatedAt: undefined,
  overdue: r.status === 'sent' && !!r.dueDate && r.dueDate < todayBangkok(),
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const item = z.object({
  description: z.string().trim().min(1, 'Describe each line item').max(200),
  qty: z.number().positive().max(1e6),
  unitPrice: z.number().min(-1e9).max(1e9),
});

const schema = z.object({
  contactId: z.string().uuid().nullable(),
  propertyId: z.string().uuid().nullable(),
  kind: z.enum(BILL_KINDS),
  status: z.enum(BILL_STATUSES),
  items: z.array(item).min(1, 'Add at least one line item').max(50),
  issueDate: date,
  dueDate: date.nullable(),
  notes: z.string().trim().max(2000),
});

const SELECT = `SELECT b.*, c.name AS contact_name, p.title AS property_title
  FROM bills b LEFT JOIN contacts c ON c.id = b.contact_id LEFT JOIN properties p ON p.id = b.property_id`;

const totalOf = (items: { qty: number; unitPrice: number }[]) =>
  Math.round(items.reduce((s, i) => s + i.qty * i.unitPrice, 0) * 100) / 100;

async function checkLinks(agentId: string, d: { contactId?: string | null; propertyId?: string | null }) {
  if (d.contactId && !(await one('SELECT 1 FROM contacts WHERE id=$1 AND agent_id=$2', [d.contactId, agentId]))) throw new HttpError(400, 'Unknown contact', 'validation');
  if (d.propertyId && !(await one('SELECT 1 FROM properties WHERE id=$1 AND agent_id=$2', [d.propertyId, agentId]))) throw new HttpError(400, 'Unknown property', 'validation');
}

bills.get('/bills', async (c) => {
  const params: unknown[] = [c.get('agent').id];
  let where = 'b.agent_id = $1';
  const status = c.req.query('status');
  if (status === 'overdue') {
    params.push(todayBangkok());
    where += ` AND b.status = 'sent' AND b.due_date < $${params.length}`;
  } else if (status && (BILL_STATUSES as readonly string[]).includes(status)) {
    params.push(status);
    where += ` AND b.status = $${params.length}`;
  }
  const rows = await query(`${SELECT} WHERE ${where} ORDER BY b.issue_date DESC, b.number DESC LIMIT 500`, params);
  return c.json(rows.map(out));
});

bills.get('/bills/:id', async (c) => {
  const row = await one(`${SELECT} WHERE b.id=$1 AND b.agent_id=$2`, [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!row) throw new HttpError(404, 'Bill not found');
  return c.json(out(row));
});

bills.post('/bills', async (c) => {
  const agent = c.get('agent');
  const data = parse(schema.partial().required({ items: true }), await body(c));
  await checkLinks(agent.id, data);
  const year = todayBangkok().slice(0, 4);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [{ next }] = await query<{ next: number }>(
      `SELECT coalesce(max(substring(number from '(\\d+)$')::int), 0) + 1 AS next FROM bills WHERE agent_id=$1 AND number LIKE $2`,
      [agent.id, `INV-${year}-%`],
    );
    const number = `INV-${year}-${String(next + attempt).padStart(4, '0')}`;
    try {
      const status = data.status ?? 'draft';
      const row = await one(
        `INSERT INTO bills (agent_id, number, contact_id, property_id, kind, status, items, total, issue_date, due_date, notes, paid_at)
         VALUES ($1,$2,$3,$4,coalesce($5,'rent'),$6,$7::jsonb,$8,coalesce($9::date,current_date),$10,coalesce($11,''), CASE WHEN $6 = 'paid' THEN now() END)
         RETURNING id`,
        [agent.id, number, data.contactId ?? null, data.propertyId ?? null, data.kind, status, JSON.stringify(data.items), totalOf(data.items), data.issueDate ?? null, data.dueDate ?? null, data.notes],
      );
      return c.json(out(await one(`${SELECT} WHERE b.id=$1`, [row.id])), 201);
    } catch (e: any) {
      if (e?.code !== '23505') throw e; // number collision with a concurrent request -> retry
    }
  }
  throw new HttpError(409, 'Could not allocate a bill number, please retry');
});

bills.patch('/bills/:id', async (c) => {
  const agent = c.get('agent');
  const id = parse(uuid, c.req.param('id'));
  const data = parse(schema.partial(), await body(c));
  await checkLinks(agent.id, data);
  const extra: Record<string, unknown> = {};
  if (data.items) extra.total = totalOf(data.items);
  if (data.status === 'paid') extra.paidAt = new Date().toISOString();
  else if (data.status) extra.paidAt = null;
  const { sets, values } = buildUpdate({ ...data, ...extra }, ['items']);
  if (!sets.length) throw new HttpError(400, 'Nothing to update', 'validation');
  const row = await one(`UPDATE bills SET ${sets.join(', ')}, updated_at = now() WHERE id=$${values.length + 1} AND agent_id=$${values.length + 2} RETURNING id`, [...values, id, agent.id]);
  if (!row) throw new HttpError(404, 'Bill not found');
  return c.json(out(await one(`${SELECT} WHERE b.id=$1`, [id])));
});

bills.delete('/bills/:id', async (c) => {
  const rows = await query('DELETE FROM bills WHERE id=$1 AND agent_id=$2 RETURNING id', [parse(uuid, c.req.param('id')), c.get('agent').id]);
  if (!rows.length) throw new HttpError(404, 'Bill not found');
  return c.json({ ok: true });
});
