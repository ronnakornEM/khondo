import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://khondo:khondo@localhost:5432/khondo_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.ALLOW_DEV_UPGRADE = 'true';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.BLOB_READ_WRITE_TOKEN;

const { app } = await import('../app.js');
const { getPool } = await import('../db.js');

async function call(method: string, path: string, opts: { token?: string; json?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.json !== undefined) headers['content-type'] = 'application/json';
  const res = await app.request(`/api${path}`, {
    method,
    headers,
    body: opts.raw ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined),
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, data, res };
}

let seq = 0;
async function register(name: string) {
  const r = await call('POST', '/auth/register', { json: { email: `agent${++seq}@example.com`, password: 'password123', name } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { token: r.data.token as string, agent: r.data.agent };
}

before(async () => {
  const pool = getPool();
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  for (const f of readdirSync('db/migrations').sort()) await pool.query(readFileSync(`db/migrations/${f}`, 'utf8'));
});
after(async () => {
  await getPool().end();
});

describe('auth & profile', () => {
  it('registers, rejects duplicates, logs in, guards routes', async () => {
    const { token, agent } = await register('Somchai Khonkaen');
    assert.equal(agent.slug, 'somchai-khonkaen');
    assert.equal(agent.plan, 'free');
    assert.equal((await call('POST', '/auth/register', { json: { email: 'AGENT1@example.com', password: 'password123', name: 'x' } })).status, 409);
    assert.equal((await call('POST', '/auth/login', { json: { email: 'agent1@example.com', password: 'wrong-pass' } })).status, 401);
    const login = await call('POST', '/auth/login', { json: { email: 'agent1@example.com', password: 'password123' } });
    assert.equal(login.status, 200);
    assert.equal((await call('GET', '/me')).status, 401);
    const me = await call('GET', '/me', { token });
    assert.equal(me.data.calendarFeedUrl, null);
    assert.equal((await call('POST', '/auth/register', { json: { email: 'a@b.co', password: 'short', name: 'x' } })).status, 400);
  });

  it('gives Thai-only names a fallback slug and keeps slugs unique', async () => {
    const a = await register('สมชาย');
    const b = await register('สมหญิง');
    assert.match(a.agent.slug, /^agent/);
    assert.notEqual(a.agent.slug, b.agent.slug);
  });

  it('updates profile, validates slug, gates premium themes', async () => {
    const { token } = await register('Profile Person');
    const ok = await call('PATCH', '/me/profile', { token, json: { headline: 'Condo specialist', landing: { accent: '#123456' } } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.agent.landing.accent, '#123456');
    assert.equal((await call('PATCH', '/me/profile', { token, json: { slug: 'Bad Slug!' } })).status, 400);
    assert.equal((await call('PATCH', '/me/profile', { token, json: { slug: 'somchai-khonkaen' } })).status, 409);
    const themed = await call('PATCH', '/me/profile', { token, json: { landing: { theme: 'modern' } } });
    assert.equal(themed.status, 402);
    assert.equal(themed.data.code, 'premium_required');
    assert.equal((await call('PATCH', '/me/profile', { token, json: { avatarUrl: 'javascript:alert(1)' } })).status, 400);
  });
});

describe('properties, freemium limits & public page', () => {
  it('enforces the free limit, isolates tenants, serves the public page', async () => {
    const { token, agent } = await register('Property Pro');
    const other = await register('Other Agent');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await call('POST', '/properties', { token, json: { title: `Condo ${i}`, price: '1500000', bedrooms: 2, areaSqm: 35.5, photos: ['https://example.com/a.jpg'], amenities: ['Pool'], featured: i === 0 } });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.price, 1500000);
      assert.equal(r.data.province, 'Khon Kaen');
      ids.push(r.data.id);
    }
    const sixth = await call('POST', '/properties', { token, json: { title: 'One too many' } });
    assert.equal(sixth.status, 402);
    assert.equal(sixth.data.code, 'property_limit');

    assert.equal((await call('GET', `/properties/${ids[0]}`, { token: other.token })).status, 404);
    assert.equal((await call('PATCH', `/properties/${ids[0]}`, { token: other.token, json: { title: 'hacked' } })).status, 404);
    assert.equal((await call('DELETE', `/properties/${ids[0]}`, { token: other.token })).status, 404);

    const upd = await call('PATCH', `/properties/${ids[1]}`, { token, json: { status: 'sold', price: '' } });
    assert.equal(upd.data.status, 'sold');
    assert.equal(upd.data.price, null);

    const pubPage = await call('GET', `/public/agents/${agent.slug}`);
    assert.equal(pubPage.status, 200);
    assert.match(pubPage.res.headers.get('cache-control')!, /s-maxage=30/);
    for (const p of ['/properties', '/inquiries', '/me', '/dashboard']) {
      assert.equal((await call('GET', p, { token })).res.headers.get('cache-control'), 'no-store', `${p} must not be cacheable`);
    }
    assert.equal(pubPage.data.properties.length, 5);
    assert.equal(pubPage.data.properties[0].status !== 'sold', true, 'available listings come first');
    assert.equal(pubPage.data.agent.showBranding, true);
    assert.equal('plan' in pubPage.data.agent, false);
    assert.equal((await call('GET', `/public/agents/${agent.slug}/properties/${ids[2]}`)).status, 200);

    await call('PATCH', `/properties/${ids[2]}`, { token, json: { published: false } });
    assert.equal((await call('GET', `/public/agents/${agent.slug}/properties/${ids[2]}`)).status, 404);
    assert.equal((await call('GET', '/public/agents/nobody-here')).status, 404);

    const tooManyPhotos = await call('PATCH', `/properties/${ids[0]}`, { token, json: { photos: Array.from({ length: 7 }, (_, i) => `https://example.com/${i}.jpg`) } });
    assert.equal(tooManyPhotos.status, 402);
    assert.equal((await call('POST', '/properties', { token: other.token, json: { title: '' } })).status, 400);
    assert.equal((await call('POST', '/uploads', { token })).status, 501);
  });

  it('hides listings beyond the plan after a downgrade', async () => {
    const { token, agent } = await register('Downgrader');
    await call('POST', '/billing/dev-plan', { token, json: { plan: 'premium' } });
    for (let i = 0; i < 7; i++) await call('POST', '/properties', { token, json: { title: `P${i}` } });
    assert.equal((await call('GET', `/public/agents/${agent.slug}`)).data.properties.length, 7);
    await call('POST', '/billing/dev-plan', { token, json: { plan: 'free' } });
    assert.equal((await call('GET', `/public/agents/${agent.slug}`)).data.properties.length, 5);
    assert.equal((await call('GET', '/me', { token })).data.hiddenProperties, 2);
  });

  it('collects inquiries from the public page with spam protection', async () => {
    const { token, agent } = await register('Inbox Agent');
    const prop = (await call('POST', '/properties', { token, json: { title: 'Lake view' } })).data;
    const url = `/public/agents/${agent.slug}/inquiries`;
    assert.equal((await call('POST', url, { json: { name: 'Buyer' } })).status, 400, 'needs phone or email');
    assert.equal((await call('POST', url, { json: { name: 'Bot', phone: '1', website: 'spam.com' } })).status, 201);
    for (let i = 0; i < 3; i++) assert.equal((await call('POST', url, { json: { name: 'Nok', phone: '0812345678', message: 'Is it available?', propertyId: prop.id } })).status, 201);
    assert.equal((await call('POST', url, { json: { name: 'Nok', phone: '0812345678' } })).status, 429);
    const list = await call('GET', '/inquiries', { token });
    assert.equal(list.data.length, 3, 'honeypot not stored');
    assert.equal(list.data[0].propertyTitle, 'Lake view');
    assert.equal((await call('PATCH', `/inquiries/${list.data[0].id}`, { token, json: { handled: true } })).data.handled, true);
    const dash = await call('GET', '/dashboard', { token });
    assert.equal(dash.data.newInquiries, 2);
    assert.equal(dash.data.outstanding, null);
    assert.equal((await call('POST', `/inquiries/${list.data[1].id}/convert`, { token })).status, 402);
  });
});

describe('premium: contacts, bills, calendar', () => {
  it('blocks free accounts', async () => {
    const { token } = await register('Free Rider');
    for (const p of ['/contacts', '/bills']) assert.equal((await call('GET', p, { token })).status, 402);
    const ev = await call('POST', '/events', { token, json: { title: 'Basic', startAt: '2026-11-01T03:00:00Z', endAt: '2026-11-01T04:00:00Z' } });
    assert.equal(ev.status, 201, 'basic events are free');
    const rec = await call('POST', '/events', { token, json: { title: 'Weekly', startAt: '2026-11-01T03:00:00Z', endAt: '2026-11-01T04:00:00Z', recurrence: 'weekly' } });
    assert.equal(rec.status, 402);
    const list = await call('GET', '/events?from=2026-10-01T00:00:00Z&to=2026-12-01T00:00:00Z', { token });
    assert.equal(list.data.length, 1);
  });

  it('runs the full premium workflow', async () => {
    const { token, agent } = await register('Premium Agent');
    const stranger = await register('Stranger Danger');
    await call('POST', '/billing/dev-plan', { token: stranger.token, json: { plan: 'premium' } });
    const up = await call('POST', '/billing/checkout', { token });
    assert.equal(up.status, 200);
    assert.equal(up.data.agent.plan, 'premium');
    assert.equal((await call('POST', '/billing/checkout', { token })).status, 409);
    assert.match((await call('GET', '/me', { token })).data.calendarFeedUrl, /\/api\/calendar\/[0-9a-f]{36}\/khondo\.ics$/);

    // themes now allowed
    assert.equal((await call('PATCH', '/me/profile', { token, json: { landing: { theme: 'modern', announcement: 'Open house Sat!' } } })).status, 200);
    assert.equal((await call('GET', `/public/agents/${agent.slug}`)).data.agent.showBranding, false);

    const prop = (await call('POST', '/properties', { token, json: { title: 'Rental condo', listingType: 'rent', rentPrice: 9000 } })).data;
    // contacts
    const contact = await call('POST', '/contacts', { token, json: { name: 'Khun Malee', phone: '0899999999', kind: 'tenant', propertyId: prop.id, tags: ['vip', 'rent'], budget: '12000' } });
    assert.equal(contact.status, 201, JSON.stringify(contact.data));
    assert.equal(contact.data.propertyTitle, 'Rental condo');
    assert.equal(contact.data.budget, 12000);
    assert.equal((await call('GET', '/contacts?q=vip', { token })).data.length, 1);
    assert.equal((await call('GET', '/contacts?q=zzz', { token })).data.length, 0);
    assert.equal((await call('GET', '/contacts?stage=new', { token })).data.length, 1);
    assert.equal((await call('PATCH', `/contacts/${contact.data.id}`, { token, json: { stage: 'viewing' } })).data.stage, 'viewing');
    assert.equal((await call('GET', `/contacts/${contact.data.id}`, { token: stranger.token })).status, 404);
    assert.equal((await call('POST', '/contacts', { token: stranger.token, json: { name: 'x', propertyId: prop.id } })).status, 400, 'cannot link someone else’s property');

    // inquiry -> contact
    await call('POST', `/public/agents/${agent.slug}/inquiries`, { json: { name: 'Web Lead', email: 'lead@example.com', message: 'Interested', propertyId: prop.id } });
    const inq = (await call('GET', '/inquiries', { token })).data[0];
    const conv = await call('POST', `/inquiries/${inq.id}/convert`, { token });
    assert.equal(conv.status, 201);
    const converted = await call('GET', `/contacts/${conv.data.contactId}`, { token });
    assert.equal(converted.data.source, 'website');

    // bills
    const b1 = await call('POST', '/bills', { token, json: { contactId: contact.data.id, propertyId: prop.id, kind: 'rent', status: 'sent', dueDate: '2020-01-05', items: [{ description: 'Rent', qty: 1, unitPrice: 9000 }, { description: 'Water', qty: 12, unitPrice: 18.5 }] } });
    assert.equal(b1.status, 201, JSON.stringify(b1.data));
    assert.match(b1.data.number, /^INV-\d{4}-0001$/);
    assert.equal(b1.data.total, 9222);
    assert.equal(b1.data.overdue, true);
    assert.equal(b1.data.contactName, 'Khun Malee');
    const b2 = await call('POST', '/bills', { token, json: { items: [{ description: 'Deposit', qty: 2, unitPrice: 9000 }], kind: 'deposit' } });
    assert.match(b2.data.number, /0002$/);
    assert.equal(b2.data.status, 'draft');
    assert.equal((await call('POST', '/bills', { token, json: { items: [] } })).status, 400);
    assert.equal((await call('GET', '/bills?status=overdue', { token })).data.length, 1);
    const dash = await call('GET', '/dashboard', { token });
    assert.deepEqual([dash.data.outstanding.count, dash.data.outstanding.total, dash.data.outstanding.overdue], [1, 9222, 1]);
    const paid = await call('PATCH', `/bills/${b1.data.id}`, { token, json: { status: 'paid' } });
    assert.equal(paid.data.overdue, false);
    assert.ok(paid.data.paidAt);
    const edited = await call('PATCH', `/bills/${b2.data.id}`, { token, json: { items: [{ description: 'Deposit', qty: 3, unitPrice: 9000 }] } });
    assert.equal(edited.data.total, 27000);
    assert.equal((await call('GET', `/bills/${b1.data.id}`, { token: stranger.token })).status, 404);
    // numbering is per-agent
    const sb = await call('POST', '/bills', { token: stranger.token, json: { items: [{ description: 'x', qty: 1, unitPrice: 1 }] } });
    assert.match(sb.data.number, /0001$/);

    // calendar
    const ev = await call('POST', '/events', { token, json: { title: 'Viewing – Rental condo', kind: 'viewing', startAt: '2026-11-02T03:00:00.000Z', endAt: '2026-11-02T04:00:00.000Z', contactId: contact.data.id, propertyId: prop.id, recurrence: 'weekly', recurrenceUntil: '2026-11-30', reminderMinutes: 30, location: 'Khon Kaen, Thailand' } });
    assert.equal(ev.status, 201, JSON.stringify(ev.data));
    assert.equal(ev.data.contactName, 'Khun Malee');
    assert.equal((await call('POST', '/events', { token, json: { title: 'Bad', startAt: '2026-11-02T05:00:00Z', endAt: '2026-11-02T04:00:00Z' } })).status, 400);
    const inRange = await call('GET', '/events?from=2026-12-01T00:00:00Z&to=2026-12-31T00:00:00Z', { token });
    assert.equal(inRange.data.length, 0, 'series ended before December');
    const nov = await call('GET', '/events?from=2026-11-15T00:00:00Z&to=2026-11-20T00:00:00Z', { token });
    assert.equal(nov.data.length, 1, 'recurring series is returned for later ranges');

    const feedUrl = new URL((await call('GET', '/me', { token })).data.calendarFeedUrl).pathname.replace(/^\/api/, '');
    const ics = await call('GET', feedUrl);
    assert.equal(ics.status, 200);
    assert.match(ics.res.headers.get('content-type')!, /text\/calendar/);
    assert.match(ics.data, /BEGIN:VCALENDAR/);
    assert.match(ics.data, /RRULE:FREQ=WEEKLY;UNTIL=20261130T235959Z/);
    assert.match(ics.data, /TRIGGER:-PT30M/);
    assert.match(ics.data, /LOCATION:Khon Kaen\\, Thailand/);
    assert.equal((await call('GET', '/calendar/deadbeef/khondo.ics')).status, 404);
    await call('POST', '/billing/dev-plan', { token, json: { plan: 'free' } });
    assert.equal((await call('GET', feedUrl)).status, 404, 'feed stops working after downgrade');
  });
});

describe('Stripe webhook', () => {
  it('verifies signatures and toggles the plan', async () => {
    const { createHmac } = await import('node:crypto');
    const { token, agent } = await register('Stripe Customer');
    await getPool().query('UPDATE agents SET stripe_customer_id=$1 WHERE id=$2', ['cus_123', agent.id]);
    const send = (event: object, secret = 'whsec_test') => {
      const raw = JSON.stringify(event);
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
      return call('POST', '/billing/webhook', { raw, headers: { 'stripe-signature': `t=${t},v1=${sig}`, 'content-type': 'application/json' } });
    };
    assert.equal((await send({ type: 'x', data: { object: {} } }, 'wrong')).status, 400);
    const end = Math.floor(Date.now() / 1000) + 86400 * 30;
    assert.equal((await send({ type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_123', status: 'active', items: { data: [{ current_period_end: end }] } } } })).status, 200);
    let me = (await call('GET', '/me', { token })).data;
    assert.equal(me.agent.plan, 'premium');
    assert.ok(me.agent.planRenewsAt);
    await send({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_123' } } });
    me = (await call('GET', '/me', { token })).data;
    assert.equal(me.agent.plan, 'free');
  });
});
