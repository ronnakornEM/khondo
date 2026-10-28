import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://khondo:khondo@localhost:5432/khondo_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.EMAIL_VERIFICATION = 'memory'; // enforce verification, capture emails in memory
process.env.APP_URL = 'https://khondo.test';
delete process.env.RESEND_API_KEY;

const { app } = await import('../app.js');
const { getPool } = await import('../db.js');
const { outbox } = await import('../mail.js');
const { makeKit } = await import('./testkit.js');
const { call, resetDb } = makeKit(app, getPool);

before(resetDb);
after(() => getPool().end());

const tokenFrom = (mail: { text: string }) => mail.text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)![1];
const register = (email: string, extra: object = {}) => call('POST', '/auth/register', { json: { email, password: 'password123', name: 'Vera Verify', ...extra } });
const resend = (email: string, extra: object = {}) => call('POST', '/auth/resend-verification', { json: { email, ...extra } });

describe('email verification', () => {
  it('registers without a session, emails a link, and blocks login until verified', async () => {
    outbox.length = 0;
    const r = await register('vera@example.com');
    assert.equal(r.status, 201);
    assert.deepEqual(r.data, { verificationRequired: true, email: 'vera@example.com', emailSent: true });
    assert.equal('token' in r.data, false, 'no session before verifying');

    assert.equal(outbox.length, 1);
    const mail = outbox[0];
    assert.equal(mail.to, 'vera@example.com');
    assert.match(mail.subject, /Verify your email/);
    assert.match(mail.text, /https:\/\/khondo\.test\/verify-email\?token=/);
    assert.match(mail.html, /Verify my email/);
    assert.match(mail.html, /Vera Verify/);

    // wrong password is still just "bad credentials"; the right one reveals the verification requirement
    assert.equal((await call('POST', '/auth/login', { json: { email: 'vera@example.com', password: 'nope-nope' } })).data.code, 'bad_credentials');
    const blocked = await call('POST', '/auth/login', { json: { email: 'vera@example.com', password: 'password123' } });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'email_not_verified');
    // the token is stored hashed, never in clear
    const stored = (await getPool().query('SELECT token_hash FROM email_verifications')).rows[0].token_hash;
    assert.notEqual(stored, tokenFrom(mail));
    assert.equal(stored.length, 64);
  });

  it('verifying consumes the token once, signs in, and unlocks login', async () => {
    const token = tokenFrom(outbox[0]);
    assert.equal((await call('POST', '/auth/verify-email', { json: { token: 'x'.repeat(43) } })).data.code, 'invalid_token');
    assert.equal((await call('POST', '/auth/verify-email', { json: { token: 'short' } })).status, 400);

    const ok = await call('POST', '/auth/verify-email', { json: { token } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.role, 'agent');
    assert.ok(ok.data.token);
    assert.equal((await call('GET', '/me', { token: ok.data.token })).data.agent.displayName, 'Vera Verify');

    assert.equal((await call('POST', '/auth/verify-email', { json: { token } })).data.code, 'invalid_token', 'single use');
    assert.equal((await call('POST', '/auth/login', { json: { email: 'vera@example.com', password: 'password123' } })).status, 200);
    assert.equal((await getPool().query(`SELECT count(*)::int n FROM email_verifications`)).rows[0].n, 0);
  });

  it('works for customers, and emails in the visitor’s language', async () => {
    outbox.length = 0;
    const r = await register('somying@example.com', { role: 'customer', lang: 'th', name: 'สมหญิง' });
    assert.equal(r.data.verificationRequired, true);
    assert.match(outbox[0].subject, /ยืนยันอีเมล/);
    const zh = await register('wei@example.com', { role: 'customer', lang: 'zh', name: '小伟' });
    assert.equal(zh.status, 201);
    assert.match(outbox[1].subject, /验证/);
    const v = await call('POST', '/auth/verify-email', { json: { token: tokenFrom(outbox[0]) } });
    assert.equal(v.data.role, 'customer');
    assert.equal((await call('GET', '/me', { token: v.data.token })).data.user.name, 'สมหญิง');
  });

  it('expired links are rejected and cleaned up', async () => {
    outbox.length = 0;
    await register('late@example.com');
    await getPool().query(`UPDATE email_verifications SET expires_at = now() - interval '1 minute'`);
    const r = await call('POST', '/auth/verify-email', { json: { token: tokenFrom(outbox[0]) } });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'invalid_token');
    assert.equal((await getPool().query(`SELECT count(*)::int n FROM email_verifications v JOIN users u ON u.id = v.user_id WHERE u.email = 'late@example.com'`)).rows[0].n, 0);
    assert.equal((await call('POST', '/auth/login', { json: { email: 'late@example.com', password: 'password123' } })).status, 403);
  });

  it('resend: new link replaces the old, cooldown applies, and it never reveals which emails exist', async () => {
    outbox.length = 0;
    await register('again@example.com');
    const first = tokenFrom(outbox[0]);
    // inside the cooldown nothing new is sent (but the answer is the same 200)
    assert.equal((await resend('again@example.com')).status, 200);
    assert.equal(outbox.length, 1);
    // after the cooldown a fresh link goes out and the old one dies
    await getPool().query(`UPDATE email_verifications SET created_at = now() - interval '2 minutes'`);
    assert.equal((await resend('again@example.com', { lang: 'th' })).status, 200);
    assert.equal(outbox.length, 2);
    assert.match(outbox[1].subject, /ยืนยันอีเมล/);
    assert.equal((await call('POST', '/auth/verify-email', { json: { token: first } })).data.code, 'invalid_token');
    assert.equal((await call('POST', '/auth/verify-email', { json: { token: tokenFrom(outbox[1]) } })).status, 200);
    // unknown and already-verified addresses: identical response, no mail
    assert.deepEqual((await resend('nobody@example.com')).data, { ok: true });
    assert.deepEqual((await resend('again@example.com')).data, { ok: true });
    assert.equal(outbox.length, 2);
    assert.equal((await resend('not-an-email')).status, 400);
  });

  it('a pending registration cannot be taken over by registering the same email again', async () => {
    await register('pending@example.com');
    const second = await register('pending@example.com', { name: 'Attacker' });
    assert.equal(second.status, 409);
  });
});
