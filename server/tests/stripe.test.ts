import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';

// A tiny fake of the Stripe API so the whole subscription flow can be tested offline.
// The same code path talks to the real Stripe sandbox when STRIPE_SECRET_KEY=sk_test_… (see README).
const calls: { method: string; path: string; body: URLSearchParams }[] = [];
let subscriptions: any[] = [];
let priceExists = true;
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d));
  req.on('end', () => {
    const url = new URL(req.url!, 'http://x');
    calls.push({ method: req.method!, path: url.pathname + url.search, body: new URLSearchParams(raw || url.search) });
    const send = (code: number, obj: unknown) => (res.writeHead(code, { 'content-type': 'application/json' }), res.end(JSON.stringify(obj)));
    if (req.headers.authorization !== 'Bearer sk_test_mock') return send(401, { error: { message: 'Invalid API Key' } });
    if (url.pathname === '/v1/prices' && req.method === 'GET') return send(200, { data: priceExists ? [{ id: 'price_mock_1' }] : [] });
    if (url.pathname === '/v1/customers') return send(200, { id: 'cus_mock_1' });
    if (url.pathname === '/v1/checkout/sessions') return send(200, { id: 'cs_test_1', url: 'https://checkout.stripe.test/c/pay/cs_test_1' });
    if (url.pathname === '/v1/billing_portal/sessions') return send(200, { url: 'https://billing.stripe.test/p/session_1' });
    if (url.pathname === '/v1/subscriptions') return send(200, { data: subscriptions });
    send(404, { error: { message: `No such route ${url.pathname}` } });
  });
});
await new Promise<void>((r) => server.listen(0, r));

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://khondo:khondo@localhost:5432/khondo_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.STRIPE_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
process.env.APP_URL = 'https://khondo.test';
process.env.ALLOW_DEV_UPGRADE = 'true';
delete process.env.STRIPE_PRICE_ID;

const { app } = await import('../app.js');
const { getPool } = await import('../db.js');
const { resetStripeCache } = await import('../stripe.js');
const { makeKit } = await import('./testkit.js');
const { call, registerAgent, resetDb } = makeKit(app, getPool);

before(resetDb);
after(async () => {
  server.close();
  await getPool().end();
});

describe('Stripe sandbox flow (mocked Stripe API)', () => {
  it('reports test mode, creates a customer + Checkout session for the lookup-key price', async () => {
    const a = await registerAgent('Payer');
    const cfg = await call('GET', '/billing/config', { token: a.token });
    assert.deepEqual(cfg.data, { stripe: true, mode: 'test', devUpgrade: true });

    const r = await call('POST', '/billing/checkout', { token: a.token });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.url, 'https://checkout.stripe.test/c/pay/cs_test_1');

    const priceLookup = calls.find((c) => c.path.startsWith('/v1/prices'))!;
    assert.equal(priceLookup.body.get('lookup_keys[]'), 'khondo_premium_monthly');
    const checkout = calls.find((c) => c.path === '/v1/checkout/sessions')!;
    assert.equal(checkout.body.get('mode'), 'subscription');
    assert.equal(checkout.body.get('customer'), 'cus_mock_1');
    assert.equal(checkout.body.get('client_reference_id'), a.agent.id);
    assert.equal(checkout.body.get('line_items[0][price]'), 'price_mock_1');
    assert.equal(checkout.body.get('success_url'), 'https://khondo.test/app/billing?status=success');
    assert.equal((await getPool().query('SELECT stripe_customer_id FROM agents WHERE id=$1', [a.agent.id])).rows[0].stripe_customer_id, 'cus_mock_1');

    // before payment completes nothing changes
    subscriptions = [];
    assert.equal((await call('POST', '/billing/sync', { token: a.token })).data.plan, 'free');
  });

  it('sync upgrades after Checkout without any webhook, and downgrades when the subscription ends', async () => {
    const a = await registerAgent('Syncer');
    await call('POST', '/billing/checkout', { token: a.token });
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    subscriptions = [{ id: 'sub_1', status: 'active', items: { data: [{ current_period_end: end }] } }];
    const up = await call('POST', '/billing/sync', { token: a.token });
    assert.deepEqual(up.data, { plan: 'premium', changed: true });
    const me = (await call('GET', '/me', { token: a.token })).data;
    assert.equal(me.agent.plan, 'premium');
    assert.ok(me.agent.planRenewsAt);
    assert.equal((await call('POST', '/billing/sync', { token: a.token })).data.changed, false, 'idempotent');
    assert.equal((await call('POST', '/billing/checkout', { token: a.token })).status, 409, 'already premium');

    const portal = await call('POST', '/billing/portal', { token: a.token });
    assert.equal(portal.data.url, 'https://billing.stripe.test/p/session_1');
    assert.equal(calls.filter((c) => c.path === '/v1/billing_portal/sessions').pop()!.body.get('return_url'), 'https://khondo.test/app/billing');

    subscriptions = [{ id: 'sub_1', status: 'canceled' }];
    assert.deepEqual((await call('POST', '/billing/sync', { token: a.token })).data, { plan: 'free', changed: true });
    assert.equal((await call('GET', '/me', { token: a.token })).data.agent.plan, 'free');
  });

  it('webhook (signed with the webhook secret) also moves the plan', async () => {
    const a = await registerAgent('Hooked');
    await call('POST', '/billing/checkout', { token: a.token });
    const send = (event: object) => {
      const raw = JSON.stringify(event);
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac('sha256', 'whsec_mock').update(`${t}.${raw}`).digest('hex');
      return call('POST', '/billing/webhook', { raw, headers: { 'stripe-signature': `t=${t},v1=${sig}`, 'content-type': 'application/json' } });
    };
    const cust = (await getPool().query('SELECT stripe_customer_id FROM agents WHERE id=$1', [a.agent.id])).rows[0].stripe_customer_id;
    assert.equal((await send({ type: 'checkout.session.completed', data: { object: { client_reference_id: a.agent.id, customer: cust, subscription: 'sub_w' } } })).status, 200);
    assert.equal((await call('GET', '/me', { token: a.token })).data.agent.plan, 'premium');
    await send({ type: 'customer.subscription.deleted', data: { object: { customer: cust } } });
    assert.equal((await call('GET', '/me', { token: a.token })).data.agent.plan, 'free');
  });

  it('explains what to do when the sandbox has no price yet, and surfaces Stripe errors', async () => {
    priceExists = false;
    resetStripeCache();
    const a = await registerAgent('Unpriced');
    const r = await call('POST', '/billing/checkout', { token: a.token });
    assert.equal(r.status, 501);
    assert.match(r.data.error, /npm run stripe:setup/);
    priceExists = true;
    resetStripeCache();
    process.env.STRIPE_SECRET_KEY = 'sk_test_wrong';
    const bad = await call('POST', '/billing/checkout', { token: (await registerAgent('BadKey')).token });
    assert.equal(bad.status, 502);
    assert.equal(bad.data.code, 'stripe_error');
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    resetStripeCache();
  });

  it('a live key is reported as live mode', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_xxx';
    const a = await registerAgent('Live');
    assert.equal((await call('GET', '/billing/config', { token: a.token })).data.mode, 'live');
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  });
});
