import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://khondo:khondo@localhost:5432/khondo_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.ALLOW_DEV_UPGRADE = 'true';
delete process.env.STRIPE_SECRET_KEY;

const { app } = await import('../app.js');
const { getPool } = await import('../db.js');
const { makeKit } = await import('./testkit.js');
const { call, registerAgent, registerCustomer, resetDb, makeSuper } = makeKit(app, getPool);

before(resetDb);
after(() => getPool().end());

async function agentWithProps(name: string, props: object[]) {
  const a = await registerAgent(name);
  const ids: string[] = [];
  for (const p of props) ids.push((await call('POST', '/properties', { token: a.token, json: p })).data.id);
  return { ...a, ids };
}

describe('superuser (premium testing)', () => {
  it('unlocks Premium, can preview Free, and is the only one who can use admin tools', async () => {
    const su = await registerAgent('Super Tester');
    const email = (await getPool().query('SELECT email FROM users ORDER BY created_at DESC LIMIT 1')).rows[0].email;
    assert.equal((await call('GET', '/contacts', { token: su.token })).status, 402, 'not yet a superuser');
    assert.equal((await call('GET', '/admin/overview', { token: su.token })).status, 403);
    await makeSuper(email);

    const me = (await call('GET', '/me', { token: su.token })).data;
    assert.equal(me.isSuperuser, true);
    assert.equal(me.agent.plan, 'premium');
    assert.equal((await call('GET', '/contacts', { token: su.token })).status, 200);
    assert.equal((await call('GET', '/bills', { token: su.token })).status, 200);
    assert.ok((await call('GET', '/me', { token: su.token })).data.calendarFeedUrl);
    // login also reports the effective plan
    assert.equal((await call('POST', '/auth/login', { json: { email, password: 'password123' } })).data.agent.plan, 'premium');

    // "View as Free" switch
    const asFree = { 'x-view-as-plan': 'free' };
    assert.equal((await call('GET', '/me', { token: su.token, headers: asFree })).data.agent.plan, 'free');
    assert.equal((await call('GET', '/contacts', { token: su.token, headers: asFree })).status, 402);

    // the header means nothing to ordinary agents
    const normal = await registerAgent('Normal Agent');
    assert.equal((await call('GET', '/me', { token: normal.token, headers: { 'x-view-as-plan': 'premium' } })).data.agent.plan, 'free');

    // the public page of a superuser has no branding (premium), listing limit is lifted
    assert.equal((await call('GET', `/public/agents/${su.agent.slug}`)).data.agent.showBranding, false);

    // admin overview + plan switch
    const overview = await call('GET', '/admin/overview', { token: su.token });
    assert.equal(overview.status, 200);
    assert.ok(overview.data.totals.agents >= 2);
    const target = overview.data.agents.find((a: any) => a.slug === normal.agent.slug);
    assert.equal(target.plan, 'free');
    assert.equal((await call('POST', `/admin/agents/${target.id}/plan`, { token: su.token, json: { plan: 'premium' } })).status, 200);
    assert.equal((await call('GET', '/me', { token: normal.token })).data.agent.plan, 'premium');
    assert.equal((await call('POST', `/admin/agents/${target.id}/plan`, { token: normal.token, json: { plan: 'free' } })).status, 403, 'a premium agent is still not an admin');
  });

  it('cannot be obtained by registering', async () => {
    const r = await call('POST', '/auth/register', { json: { email: 'sneaky@example.com', password: 'password123', name: 'x', role: 'superuser' } });
    assert.equal(r.status, 400);
    const ok = await call('POST', '/auth/register', { json: { email: 'sneaky@example.com', password: 'password123', name: 'x', isSuperuser: true } });
    assert.equal(ok.status, 201);
    assert.equal((await call('GET', '/admin/overview', { token: ok.data.token })).status, 403);
  });
});

describe('customer accounts & guest mode', () => {
  it('registers customers, keeps them out of the agent area, and links inquiries', async () => {
    const agent = await agentWithProps('Inquiry Agent', [{ title: 'Condo A' }]);
    const c = await registerCustomer('Buyer Bee', '0811111111');
    const me = await call('GET', '/me', { token: c.token });
    assert.equal(me.data.role, 'customer');
    assert.equal(me.data.user.name, 'Buyer Bee');
    for (const p of ['/properties', '/dashboard', '/contacts']) {
      const r = await call('GET', p, { token: c.token });
      assert.equal(r.status, 403, p);
      assert.equal(r.data.code, 'agent_only');
    }
    assert.equal((await call('POST', '/auth/login', { json: { email: c.email, password: 'password123' } })).data.role, 'customer');
    assert.equal((await call('PATCH', '/account', { token: c.token, json: { phone: '0822222222' } })).data.user.phone, '0822222222');

    // guest inquiry works without any account; signed-in inquiry is linked to the customer
    const url = `/public/agents/${agent.agent.slug}/inquiries`;
    assert.equal((await call('POST', url, { json: { name: 'Guest Gary', phone: '0899999999', message: 'hello', propertyId: agent.ids[0] } })).status, 201);
    assert.equal((await call('POST', url, { token: c.token, json: { name: 'Buyer Bee', email: c.email, message: 'Still available?', propertyId: agent.ids[0] } })).status, 201);
    assert.equal((await call('POST', url, { token: 'garbage', json: { name: 'x', phone: '1' } })).status, 401, 'a broken token is rejected, not silently treated as guest');

    const mine = await call('GET', '/my/inquiries', { token: c.token });
    assert.equal(mine.data.length, 1);
    assert.equal(mine.data[0].propertyTitle, 'Condo A');
    assert.equal(mine.data[0].agentSlug, agent.agent.slug);
    assert.equal(mine.data[0].message, 'Still available?');
    assert.equal((await call('GET', '/inquiries', { token: agent.token })).data.length, 2, 'agent sees both');
    assert.equal((await call('GET', '/my/inquiries')).status, 401);
  });

  it('saves favourites, merges guest favourites, and hides listings that stopped being public', async () => {
    const agent = await agentWithProps('Fav Agent', [{ title: 'F1' }, { title: 'F2' }, { title: 'F3', published: false }]);
    const c = await registerCustomer('Fan');
    assert.equal((await call('GET', '/favorites/ids')).status, 401);
    assert.equal((await call('PUT', `/favorites/${agent.ids[0]}`, { token: c.token })).status, 200);
    assert.equal((await call('PUT', `/favorites/${agent.ids[0]}`, { token: c.token })).status, 200, 'idempotent');
    assert.equal((await call('PUT', `/favorites/${agent.ids[2]}`, { token: c.token })).status, 404, 'unpublished listing');
    assert.equal((await call('PUT', '/favorites/not-a-uuid', { token: c.token })).status, 400);
    assert.deepEqual((await call('GET', '/favorites/ids', { token: c.token })).data.ids, [agent.ids[0]]);
    // guest favourites collected in the browser are merged on sign-in (unknown/unpublished ids are ignored)
    assert.equal((await call('POST', '/favorites/merge', { token: c.token, json: { ids: [agent.ids[1], agent.ids[2], '00000000-0000-4000-8000-000000000000'] } })).status, 200);
    const ids = (await call('GET', '/favorites/ids', { token: c.token })).data.ids.sort();
    assert.deepEqual(ids, [agent.ids[0], agent.ids[1]].sort());
    const list = await call('GET', '/favorites', { token: c.token });
    assert.equal(list.data.items.length, 2);
    assert.equal(list.data.items[0].agent.slug, agent.agent.slug);
    await call('PATCH', `/properties/${agent.ids[0]}`, { token: agent.token, json: { published: false } });
    assert.equal((await call('GET', '/favorites', { token: c.token })).data.items.length, 1, 'unpublished listings drop out');
    assert.equal((await call('DELETE', `/favorites/${agent.ids[1]}`, { token: c.token })).status, 200);
    assert.equal((await call('GET', '/favorites', { token: c.token })).data.items.length, 0);
    // another user's favourites are separate
    const other = await registerCustomer('Other');
    assert.deepEqual((await call('GET', '/favorites/ids', { token: other.token })).data.ids, []);
  });
});

describe('browse all properties (public)', () => {
  it('lists live listings across agents with filters, sorting, paging and plan limits', async () => {
    await resetDb();
    const a = await agentWithProps('Alpha Realty', [
      { title: 'Alpha Condo Lake', type: 'condo', listingType: 'sale', price: 2000000, bedrooms: 1, district: 'Mueang' },
      { title: 'Alpha Villa', type: 'house', listingType: 'sale', price: 9000000, bedrooms: 4, district: 'Nong Rawiang' },
      { title: 'Alpha Rental', type: 'condo', listingType: 'rent', rentPrice: 8000, bedrooms: 1 },
      { title: 'Alpha Sold', type: 'condo', listingType: 'sale', price: 1, status: 'sold' },
      { title: 'Alpha Hidden', type: 'condo', listingType: 'sale', price: 5, published: false },
    ]);
    const b = await agentWithProps('Beta Homes', [
      { title: 'Beta Townhome', type: 'townhouse', listingType: 'both', price: 3500000, rentPrice: 15000, bedrooms: 3, status: 'reserved' },
      { title: 'Beta Land', type: 'land', listingType: 'sale', price: 4500000 },
    ]);
    const get = async (qs = '') => (await call('GET', `/public/properties${qs}`)).data;

    const all = await get();
    assert.equal(all.total, 5, 'sold and unpublished are not browsable');
    assert.deepEqual(all.items.map((i: any) => i.title).sort(), ['Alpha Condo Lake', 'Alpha Rental', 'Alpha Villa', 'Beta Land', 'Beta Townhome']);
    const item = all.items.find((i: any) => i.title === 'Beta Land');
    assert.equal(item.agent.slug, b.agent.slug);
    assert.equal(item.agent.displayName, 'Beta Homes');
    const res = await call('GET', '/public/properties');
    assert.match(res.res.headers.get('cache-control')!, /s-maxage=30/);

    assert.equal((await get('?q=nong')).total, 1, 'district search');
    assert.equal((await get('?q=beta')).total, 2, 'agent name search');
    assert.equal((await get('?type=condo')).total, 2);
    assert.equal((await get('?listing=rent')).items.map((i: any) => i.title).sort().join(), 'Alpha Rental,Beta Townhome');
    assert.equal((await get('?listing=sale&min=3000000&max=5000000')).items.map((i: any) => i.title).sort().join(), 'Beta Land,Beta Townhome');
    assert.equal((await get('?listing=rent&max=10000')).items.map((i: any) => i.title).join(), 'Alpha Rental');
    assert.equal((await get('?beds=3')).total, 2);
    assert.equal((await get(`?agent=${a.agent.slug}`)).total, 3);
    assert.deepEqual((await get('?listing=sale&sort=price_asc')).items.map((i: any) => i.price), [2000000, 3500000, 4500000, 9000000]);
    assert.deepEqual((await get('?listing=sale&sort=price_desc')).items.map((i: any) => i.price), [9000000, 4500000, 3500000, 2000000]);
    assert.equal((await get('?q=zzzz')).total, 0);
    assert.equal((await call('GET', '/public/properties?type=spaceship')).status, 400);
    assert.equal((await call('GET', '/public/properties?page=0')).status, 400);
    assert.equal((await get('?page=2')).items.length, 0, 'page beyond the end is empty');

    // downgraded agents only expose what their plan allows
    const heavy = await registerAgent('Heavy Lister');
    await call('POST', '/billing/dev-plan', { token: heavy.token, json: { plan: 'premium' } });
    for (let i = 0; i < 8; i++) await call('POST', '/properties', { token: heavy.token, json: { title: `Heavy ${i}` } });
    assert.equal((await get(`?agent=${heavy.agent.slug}`)).total, 8);
    await call('POST', '/billing/dev-plan', { token: heavy.token, json: { plan: 'free' } });
    assert.equal((await get(`?agent=${heavy.agent.slug}`)).total, 5);
  });

  it('paginates', async () => {
    const p = await registerAgent('Pager');
    await call('POST', '/billing/dev-plan', { token: p.token, json: { plan: 'premium' } });
    for (let i = 0; i < 26; i++) await call('POST', '/properties', { token: p.token, json: { title: `Page item ${i}` } });
    const first = (await call('GET', `/public/properties?agent=${p.agent.slug}`)).data;
    assert.equal(first.total, 26);
    assert.equal(first.items.length, 24);
    const second = (await call('GET', `/public/properties?agent=${p.agent.slug}&page=2`)).data;
    assert.equal(second.items.length, 2);
    assert.equal(new Set([...first.items, ...second.items].map((i: any) => i.id)).size, 26);
  });

  it('property pages return other assets of the same agent', async () => {
    const a = await agentWithProps('Portfolio Agent', [
      { title: 'Main', featured: false },
      { title: 'Sibling 1' }, { title: 'Sibling 2' },
      { title: 'Sold one', status: 'sold' },
    ]);
    const other = await agentWithProps('Another Agent', [{ title: 'Not mine' }]);
    const r = await call('GET', `/public/agents/${a.agent.slug}/properties/${a.ids[0]}`);
    assert.equal(r.status, 200);
    assert.equal(r.data.property.title, 'Main');
    assert.deepEqual(r.data.others.map((o: any) => o.title).sort(), ['Sibling 1', 'Sibling 2']);
    assert.equal(r.data.othersTotal, 2);
    assert.ok(!r.data.others.some((o: any) => o.id === a.ids[0]), 'does not list itself');
    assert.ok(!r.data.others.some((o: any) => o.title === 'Not mine'));
    assert.equal(r.data.agent.slug, a.agent.slug);
    assert.equal((await call('GET', `/public/agents/${a.agent.slug}/properties/${other.ids[0]}`)).status, 404, 'another agent’s listing under the wrong slug');
  });
});
