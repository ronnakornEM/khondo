import { Hono } from 'hono';
import { query } from '../db.js';
import { requireAuth, type AuthEnv } from '../auth.js';
import { eventOut } from '../mappers.js';
import { PLANS } from '../../shared/plans.js';
import { todayBangkok } from './bills.js';
import { CONTACT_STAGES, PROPERTY_STATUSES, type DashboardResponse } from '../../shared/types.js';

export const dashboard = new Hono<AuthEnv>();
// Scoped to this router's own paths: mounted at '/', a bare '*' would leak onto every other route.
for (const path of ['/dashboard', '/dashboard/*']) dashboard.use(path, requireAuth);

dashboard.get('/dashboard', async (c) => {
  const agent = c.get('agent');
  const limits = PLANS[agent.plan];
  const props = Object.fromEntries(PROPERTY_STATUSES.map((s) => [s, 0])) as DashboardResponse['properties'];
  for (const r of await query<{ status: keyof typeof props; n: number }>('SELECT status, count(*)::int AS n FROM properties WHERE agent_id=$1 GROUP BY status', [agent.id])) props[r.status] = r.n;

  const [{ n: newInquiries }] = await query<{ n: number }>('SELECT count(*)::int AS n FROM inquiries WHERE agent_id=$1 AND NOT handled', [agent.id]);

  const upcoming = await query(
    `SELECT e.*, c.name AS contact_name, p.title AS property_title
     FROM events e LEFT JOIN contacts c ON c.id=e.contact_id LEFT JOIN properties p ON p.id=e.property_id
     WHERE e.agent_id=$1 AND e.recurrence='none' AND e.end_at >= now() ORDER BY e.start_at LIMIT 6`,
    [agent.id],
  );

  let outstanding: DashboardResponse['outstanding'] = null;
  if (limits.bills) {
    const [b] = await query<{ count: number; total: number; overdue: number }>(
      `SELECT count(*)::int AS count, coalesce(sum(total),0) AS total,
              count(*) FILTER (WHERE due_date < $2)::int AS overdue
       FROM bills WHERE agent_id=$1 AND status='sent'`,
      [agent.id, todayBangkok()],
    );
    outstanding = b;
  }
  let contactsByStage: DashboardResponse['contactsByStage'] = null;
  if (limits.contacts) {
    contactsByStage = Object.fromEntries(CONTACT_STAGES.map((s) => [s, 0])) as NonNullable<DashboardResponse['contactsByStage']>;
    for (const r of await query<{ stage: keyof NonNullable<DashboardResponse['contactsByStage']>; n: number }>('SELECT stage, count(*)::int AS n FROM contacts WHERE agent_id=$1 GROUP BY stage', [agent.id])) contactsByStage[r.stage] = r.n;
  }
  const res: DashboardResponse = { properties: props, newInquiries, upcomingEvents: upcoming.map(eventOut) as any, outstanding, contactsByStage };
  return c.json(res);
});
